'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { EvidenceTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import { useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, ReadingFoot } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import KeypadHint from '@/components/KeypadHint';
import Arrow from '@/components/ui/Arrow';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight } from '@/lib/insights';
import { loadShard, shareUnder, type ProjectorCells, type ProjectorIndex, type ProjectorShard } from '@/lib/tools/data';
import { MARATHON_KM, MATS_KM, perKm, perUnit } from '@/lib/tools/pace';
import { formatClock, formatDuration, formatHM, parseClock, parseDuration, parseTrackerText, type MatReading } from '@/lib/tools/time';
import { keypadInput } from '@/lib/keypad';
import { count } from '@/lib/viz/format';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const INDEX_PATH = 'tools/projector.json';
const CARDS_KEY = 'pace-notes-projector-runners';
const START_KEY = 'pace-notes-projector-start';
const MAX_CARDS = 4;

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
/** What the group matched on beyond the pace so far, as the end of "finishes on 3:58–4:00 even pace…". */
const VARIANT_SUFFIX: Record<string, string> = {
  all: '',
  men: ', recorded as men',
  women: ', recorded as women',
  faster: ' with a quicker last 5K',
  similar: ' with a similar last 5K',
  slower: ' with a slower last 5K',
};

/** Elapsed chip time as trackers show it. "24:53" (or "24:53.4") is minutes:seconds; "2:21" is hours:minutes; three groups are h:mm:ss. */
export function parseElapsed(input: string): number | null {
  // One time, never a list, so a comma is a keypad's dot ("24:53,4" is 24:53.4).
  const text = input.trim().replace(/,/g, '.');
  if (!text || text === 'none') return null;
  // Tenths only after a real colon: a dotted "10.30.15" is a walker's h:mm:ss, read below.
  const two = text.match(/^(\d{1,2})[:.](\d{2})$/) ?? text.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
  if (two && (!two[3] || Number(two[1]) >= 10)) {
    const [a, b] = [Number(two[1]), Number(two[2])];
    if (b >= 60) return null;
    return a >= 10 ? a * 60 + b + (two[3] ? Number(`0.${two[3]}`) : 0) : a * 3600 + b * 60;
  }
  // The keypad's 25.50.12 shows 25:50:12 (lib/keypad.ts). From 13 up, three groups are minutes, seconds and hundredths:
  // no mat is reached in under 13 minutes or after 13 hours.
  const hundredths = text.match(/^(\d{2,3})[:.]([0-5]\d)[:.](\d{1,3})$/);
  if (hundredths && Number(hundredths[1]) >= 13) return Number(hundredths[1]) * 60 + Number(hundredths[2]) + Number(`0.${hundredths[3]}`);
  const seconds = parseDuration(text, 'race');
  return seconds !== null && seconds > 0 ? seconds : null;
}

/** The example runner's pace per km (its time at the default mat), so a new mat re-seeds the untouched time field at it. */
const EXAMPLE_S_PER_KM = (parseElapsed(DEFAULTS.t) ?? 0) / Number(DEFAULTS.mat);

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

/** A mat by its name, the same in both unit modes ("25K"; the site's mats are distances, never mile splits). */
function matName(km: number, _units?: UnitSystem): string {
  return km >= 42.19 ? 'Finish' : `${km}K`;
}
/** The mat's distance in miles, under its name in miles mode: "15.5 mi". */
const matMiles = (km: number) => `${(km / KM_PER_MILE).toFixed(1)} mi`;

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
      {onRetry ? <button type="button" className="btn btn-secondary is-compact" onClick={onRetry}>Try again</button> : null}
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

function ElapsedField({ label, value, onChange, placeholder, hint, large = false, inputRef, error, id: given, keypadHint = true }: {
  label: ReactNode; value: number | null; onChange: (seconds: number | null) => void; placeholder?: string; hint?: ReactNode;
  large?: boolean; inputRef?: RefObject<HTMLInputElement>; error?: string | null; id?: string;
  /** False where the caller places the "Tap . for :" line itself (the runner card's grid, below its Update button). */
  keypadHint?: boolean;
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
          const typed = keypadInput(e.target, e.nativeEvent);
          setText(typed);
          const next = typed.trim() ? parseElapsed(typed) : null;
          last.current = next;
          onChange(next);
        }}
        onBlur={() => { setTouched(true); if (parsed !== null) setText(elapsedText(parsed)); }} />
      {message ? <p className="tool-field-hint is-error" id={`${id}-hint`}>{message}{keypadHint && <KeypadHint />}</p>
        : hint ? <p className="tool-field-hint" id={`${id}-hint`}>{hint}{keypadHint && <KeypadHint />}</p> : keypadHint && <KeypadHint block />}
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
            aria-label={units === 'mi' ? `${km}K mat, ${matMiles(km)}` : `${km}K mat`}>
            <b>{km}K</b>
            {units === 'mi' && km === mat ? <small>{matMiles(km)}</small> : null}
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
/* Where these finishes ended                                          */
/* ------------------------------------------------------------------ */

interface Marker { key: string; x: number; label: string; tone: 'even' | 'target' }

/** Width of one character of a 12 px chart label. */
const CHAR_W = 7.2;

/** Lay marker labels out in rows so they never overlap. */
function stackLabels(markers: Marker[], width: number, margin: number) {
  const rows: number[] = [];
  return [...markers].sort((a, b) => a.x - b.x).map((m) => {
    const w = m.label.length * CHAR_W;
    // Centred on its line where it fits, otherwise slid inside the chart's edges.
    const x0 = Math.max(margin, Math.min(m.x - w / 2, width - margin - w));
    let row = rows.findIndex((end) => end + 10 < x0);
    if (row < 0) { row = rows.length; rows.push(x0 + w); } else rows[row] = x0 + w;
    return { ...m, x0, w, row };
  });
}

/**
 * The finish times of the group as a density drawn from its published percentiles: the finishes at or under the
 * even-pace finish of the times entered in the accent (the share the sentence above names), the even-pace finish dashed,
 * and the target, when one is set, in ink. The median is the card's (round 6: it was said three times in two screens).
 * Drawn in pixels at the measured width, so labels stay 12 px.
 */
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
  // The same h:mm:ss as the sentence above the chart, at every width.
  const fmt = (s: number) => formatDuration(s, true);
  const markers = stackLabels([
    { key: 'even', x: x(P), label: `Even pace ${fmt(P)}`, tone: 'even' as const },
    ...(target !== null ? [{ key: 'target', x: x(target), label: `${narrow ? '' : 'Target '}${targetText(target)}${targetTag ? ` · ${targetTag}` : ''}`, tone: 'target' as const }] : []),
  ], width, m.l);
  const rows = Math.max(1, ...markers.map((mk) => mk.row + 1));
  const top = 8 + rows * 18;
  const plotH = narrow ? 88 : 108;
  const base = top + plotH;
  const H = base + 26;
  const densities = q.slice(0, -1).map((v, i) => 0.05 / Math.max(1, q[i + 1] - v));
  const maxD = Math.max(...densities);
  const step = niceStep(hi - lo, narrow ? 4 : 7, [60, 120, 300, 600, 900, 1800, 3600, 7200]);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const label = `Finish times of these finishes: 10th percentile ${formatDuration(q[i10], true)}, median ${formatDuration(q[i50], true)}, 90th percentile ${formatDuration(q[i90], true)}. The even-pace finish of the times entered is ${formatDuration(P, true)}; the finishes at or under it are marked${target !== null && targetTag ? `; target ${targetText(target)}: ${targetTag}` : ''}.`;
  // Each bar split at the even-pace finish: the part at or under it is the reading.
  const bars = densities.flatMap((d, i) => {
    const h = (d / maxD) * (plotH - 6);
    const [a, b] = [q[i], q[i + 1]];
    if (b <= P) return [{ key: `${i}`, a, b, h, on: true }];
    if (a >= P) return [{ key: `${i}`, a, b, h, on: false }];
    return [{ key: `${i}a`, a, b: P, h, on: true }, { key: `${i}b`, a: P, b, h, on: false }];
  });
  return (
    <div ref={ref} className="projector-chart">
      <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t} className="projector-grid">
            <line x1={x(t)} x2={x(t)} y1={top - 2} y2={base} />
            <text x={x(t)} y={base + 18} textAnchor="middle">{hm(t)}</text>
          </g>
        ))}
        {bars.map((r) => <rect key={r.key} className={`projector-bar${r.on ? ' is-on' : ''}`} x={x(r.a)} width={Math.max(0.5, x(r.b) - x(r.a))} y={base - r.h} height={r.h} />)}
        <line className="projector-base" x1={m.l} x2={width - m.r} y1={base} y2={base} />
        {markers.map((mk) => (
          <line key={mk.key} className={`projector-marker-line is-${mk.tone}`} x1={mk.x} x2={mk.x} y1={14 + mk.row * 18 + 4} y2={base} />
        ))}
        {markers.map((mk) => (
          <g key={mk.key}>
            <rect className="projector-marker-halo" x={mk.x0 - 3} y={14 + mk.row * 18 - 12} width={mk.w + 6} height={16} />
            <text x={mk.x0} y={14 + mk.row * 18} className={`projector-marker is-${mk.tone}`}>{mk.label}</text>
          </g>
        ))}
      </svg>
    </div>
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
        <p className="projector-card-empty">Too few finishes on this pace at this mat{scope.slug !== 'all' ? ` in ${scope.city}` : ''}. Open it to see other options.</p>
      ) : (
        <div className="projector-card-scroll">
          <table className="projector-card-table">
            <caption className="sr-only">{card.start !== null ? 'Clock-time' : 'Elapsed-time'} windows (10th to 90th percentile) and medians for the next mats</caption>
            <thead><tr><th scope="col">Mat</th><th scope="col">{card.start !== null ? 'Clock window' : 'Window'}</th><th scope="col">Median</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.km} className={r.km > 42 ? 'is-finish' : undefined}>
                  <th scope="row">{r.km > 42 ? 'Finish' : `${r.km}K`}{r.km < 42 && units === 'mi' ? <small>{matMiles(r.km)}</small> : null}</th>
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
            <ElapsedField label={`Time at ${matName(nextKm, units)}`} value={next} onChange={setNext} placeholder="h:mm:ss" keypadHint={false} />
            <button type="button" className="btn btn-secondary is-compact" disabled={next === null || next <= card.t}
              onClick={() => { if (next !== null && next > card.t) { onUpdate({ ...card, prev: card.t, t: next, mat: nextKm }); setNext(null); } }}>Update</button>
            <KeypadHint block />
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
  // The course and the optional fields wait in one disclosure, open once any of them holds a value (typed, or from a
  // link) or a linked course could not be shown.
  const [moreOpen, setMoreOpen] = useState(false);
  const scopeInfo = index ? index.scopes.find((s) => s.slug === q.course) ?? index.scopes.find((s) => s.slug === 'all') ?? index.scopes[0] : null;
  const scope = scopeInfo?.slug ?? (q.course || 'all');
  const scopeName = scopeInfo ? scopeInfo.city ?? 'All courses' : 'All courses';
  const shardState = useShard(index, scope, mat);
  const shard = shardState.shard;

  const [courseNotice, setCourseNotice] = useState(false);
  const hasMore = !!q.prev || (!!q.target && q.target !== 'none') || q.v !== DEFAULTS.v || courseNotice;
  useEffect(() => { if (ready && hasMore) setMoreOpen(true); }, [ready, hasMore]);
  // Rewrite a link's unknown mat, course or comparison, and unreadable times, to what the page actually shows.
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
  // While the time field still holds the example (nothing typed, pasted, opened or linked), choosing another mat moves
  // the example runner there at the same pace: one tap never turns the 4:00 example into a 2:50 projection.
  const [exampleTime, setExampleTime] = useState(true);
  useEffect(() => { if (ready && fromUrl.has('t')) setExampleTime(false); }, [ready, fromUrl]);

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
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [clockView, setClockView] = useState<'clock' | 'elapsed'>('clock');
  useEffect(() => {
    setStartText(readStart());
    setCards(readCards());
  }, []);
  const saveStart = (text: string) => { setStartText(text); writeStart(text); };
  const start = startText.trim() ? parseClock(startText) : null;
  const hasStart = start !== null;
  useEffect(() => { if (hasStart) setExtrasOpen(true); }, [hasStart]);
  const updateCards = (next: RunnerCard[]) => { setCards(next); writeCards(next); };

  // Derived projection.
  const prevError = prevRaw !== null && E !== null && prevRaw >= E ? `The ${matName(mat - 5, units)} time must be earlier than the ${matName(mat, units)} time.` : null;
  const prev = prevError ? null : prevRaw;
  const trend = index && E !== null && prev !== null ? trendOf(E, prev, mat, index.trend_threshold) : null;
  let variant = 'all';
  // What the comparison matched on, said under its menu.
  let compareHint: string;
  if (pref === 'men' || pref === 'women') {
    variant = pref;
    compareHint = prev !== null ? 'Trend is off while a recorded gender is chosen.' : 'Matched on the pace so far and recorded gender.';
  } else if (pref === 'trend') {
    if (trend) variant = trend.kind;
    compareHint = trend ? `Matched on a ${trend.kind === 'faster' ? 'quicker' : trend.kind} last 5K too.`
      : mat === 5 ? `The trend starts at the ${matName(10, units)} mat.` : `Add the ${matName(mat - 5, units)} time to match the trend too.`;
  } else compareHint = 'Matched on the pace so far only.';
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
  const showClock = start !== null && clockView === 'clock';
  // Windows are widened to whole minutes: the low end rounded down, the high end up.
  const span = (a: number, b: number) => (showClock ? clockRange(start! + a, ceilMinute(start! + b)) : windowText(a, b));
  const at = (elapsed: number) => (showClock ? formatClock(start! + elapsed) : formatDuration(elapsed, true));

  const chooseMat = (km: number) => {
    const patch: Partial<QueryShape> = { mat: String(km), prev: '' };
    if (entry === 'pace' && paceTyped !== null) patch.t = elapsedText(perKm(paceTyped, units) * km);
    else if (exampleTime) patch.t = elapsedText(Math.round(EXAMPLE_S_PER_KM * km));
    setQ(patch);
  };
  const advance = () => {
    if (E === null || mat >= 40) return;
    setEntry('time'); setExampleTime(false);
    setQ({ mat: String(mat + 5), prev: elapsedText(E), t: 'none' });
    window.setTimeout(() => timeRef.current?.focus(), 0);
  };
  const onPaste = useCallback((readings: MatReading[]) => {
    const latest = readings.reduce((a, b) => (b.km >= a.km ? b : a));
    const before = readings.find((r) => r.km === latest.km - 5);
    setEntry('time'); setExampleTime(false);
    setQ({ mat: String(latest.km), t: elapsedText(latest.elapsed), prev: before ? elapsedText(before.elapsed) : '' });
  }, [setQ]);
  const applyFallback = (patch: Partial<QueryShape>, text: string) => {
    setNotice({ key: keyOf({ ...q, ...patch }), text });
    setQ(patch);
  };
  const openCard = (card: RunnerCard) => {
    setEntry('time'); setExampleTime(false);
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
    { value: 'trend', label: 'The same pace and the same last 5K' }, { value: 'all', label: 'The same pace' },
    ...(scope === 'all' || pref === 'women' || pref === 'men' ? [{ value: 'women' as Pref, label: 'The same pace, recorded as women' }, { value: 'men' as Pref, label: 'The same pace, recorded as men' }] : []),
  ];

  /* ---------- Results ---------- */
  // The answer (the night card, or what stands in for it) comes before the inputs, the analyses' grammar; `results` is
  // everything after them.
  let answer: ReactNode = null;
  let results: ReactNode = null;
  // One short summary for screen readers (announced once typing settles) and, on phones, under the time field.
  let status = '';
  let quick: ReactNode = null;
  // The quick line is only the jump to the night card: it rides beside the entry switch instead of taking a row.
  let jump = false;
  const loadError = indexError ?? (index && E !== null ? shardState.error : null);
  if (loadError) {
    answer = <LoadError error={loadError} onRetry={indexError ? retryIndex : shardState.retry} />;
    status = loadError;
    quick = <p className="projector-quick-text is-error">{loadError}</p>;
  } else if (!index || !scopeInfo) {
    answer = <p className="tool-state">Loading the data…</p>;
  } else if (E === null || P === null || band === null) {
    answer = <p className="tool-empty">Enter the elapsed time at {matName(mat, units)} from the tracker, or paste the tracker’s splits, to see where similar finishes ended{target !== null ? ` and how many were under ${targetText(target)}` : ''}.</p>;
    status = `Enter the elapsed time at ${matName(mat, units)}.`;
  } else if (!shard) {
    answer = <p className="tool-state">Loading the data…</p>;
    quick = <p className="projector-quick-text">Loading…</p>;
  } else if (!cell) {
    const range = scopeInfo.mats[String(mat)]?.bands ?? null;
    const outside = !range || band < range[0] || band > range[1];
    const genderOnCourse = (variant === 'men' || variant === 'women') && scope !== 'all';
    const options: { label: string; patch: Partial<QueryShape>; note: string }[] = [];
    if (variant !== 'all' && cellAt(shard.cells.all, band)) {
      options.push(variant === 'men' || variant === 'women'
        ? { label: `Use all ${scopeName} finishes`, patch: { v: 'all' }, note: 'Gender removed: recorded-gender groups exist for All courses only.' }
        : { label: 'Remove trend', patch: { v: 'all' }, note: `Trend removed: too few ${scopeName} finishes on this pace at ${matName(mat, units)} had a ${variant} last 5K.` });
    }
    if (scope !== 'all') {
      const all = index.scopes.find((s) => s.slug === 'all')?.mats[String(mat)]?.bands;
      if (all && band >= all[0] && band <= all[1]) {
        options.push({ label: 'Show All courses', patch: { course: 'all' },
          note: genderOnCourse ? 'Showing All courses: recorded-gender groups exist for All courses only.' : `Showing All courses: too few ${scopeName} finishes in this group.` });
      }
    }
    const heading = genderOnCourse ? 'Recorded-gender groups exist for All courses only.'
      : outside ? `${hm(band)}–${hm(band + bandS)} even pace at ${matName(mat, units)} is outside the published range${scopeName === 'All courses' ? '' : ` for ${scopeName}`}.`
        : `Too few ${scopeName === 'All courses' ? '' : `${scopeName} `}finishes match this pace${variant === 'all' ? '' : ' and group'} at ${matName(mat, units)}.`;
    status = `No published group. ${heading}`;
    quick = (
      <>
        <p className="projector-quick-text"><b>No published group</b> for this time and comparison.</p>
        <button type="button" className="projector-link-button" data-not-edit onClick={toResult}>See the options ↑</button>
      </>
    );
    answer = (
      <section className="tool-panel projector-unavailable" aria-labelledby="projector-unavailable-title">
        <p className="tool-reading-kicker">No published group</p>
        <h2 className="tool-panel-title" id="projector-unavailable-title">{heading}</h2>
        <p className="tool-note">{outside && range && !genderOnCourse ? `Published groups here run from ${hm(range[0])} to ${hm(range[1] + bandS)} even pace. ` : ''}
          {options.length ? 'You can widen the comparison:' : 'Check the time and the mat.'}</p>
        {options.length ? <div className="tool-share">{options.map((o) => <button key={o.label} type="button" className="btn btn-secondary is-compact" onClick={() => applyFallback(o.patch, o.note)}>{o.label}</button>)}</div> : null}
      </section>
    );
  } else {
    const i10 = qIndex(Q, 0.1); const i50 = qIndex(Q, 0.5); const i90 = qIndex(Q, 0.9);
    const laterRows = [
      ...cell.later.map((v, j) => ({ km: mat + 5 * (j + 1), lo: v[0], mid: v[1], hi: v[2] })),
      { km: MARATHON_KM, lo: cell.q[i10], mid: cell.q[i50], hi: cell.q[i90] },
    ];
    const activeNotice = notice && notice.key === keyOf(q) ? notice.text : null;
    const bandText = `${hm(cell.b)}–${hm(cell.b + bandS)}`;
    const rangeText = windowText(cell.q[i10], cell.q[i90]);
    const median = cell.q[i50];
    const nextRow = laterRows[0];
    // How many of these finishes made the even-pace finish of the times entered, or better.
    const heldShare = shareUnder(P, cell.q, Q);
    // The mats still to come; the finish is the card's own headline, so the grid stops at 40K.
    const matRows = laterRows.filter((r) => r.km < 42);
    status = `${isExample ? `Example: ${formatDuration(E, true)} at ${matName(mat, units)}. ` : ''}${scopeName} at ${matName(mat, units)}: on ${bandText} even pace, ${count(cell.n)} finishes. Median finish ${formatDuration(median, true)}; 10th to 90th percentile ${rangeText.replace('–', ' to ')}.`
      + (nextRow.km < 42 ? ` ${matName(nextRow.km, units)}: ${span(nextRow.lo, nextRow.hi).replace('–', ' to ')}.` : '');
    // The night card is the result, right above the inputs: no link back up to it (critic round 3).
    answer = (
        <section className="tool-reading night projector-headline" aria-labelledby="projector-title">
          <div className="tool-reading-head">
            <p className="tool-reading-kicker">{isExample ? 'Example · ' : ''}{scopeName} · at {matName(mat, units)}</p>
            <h2 className="tool-reading-figure" id="projector-title">
              <span className="sr-only">Finish window: </span>{breakable(showClock ? clockRange(start! + cell.q[i10], ceilMinute(start! + cell.q[i90])) : rangeText)}
              <small>Where 80% of {count(cell.n)} finishes on {bandText} even pace{VARIANT_SUFFIX[variant]} ended.</small>
            </h2>
          </div>
          <dl className="tool-ledger">
            <div><dt>Median finish</dt><dd>{at(median)}</dd></div>
            {target !== null && passed ? (
              <div><dt>Target {targetText(target)}</dt><dd>Passed</dd></div>
            ) : target !== null && share ? (
              <div><dt>Under {targetText(target)}</dt><dd>{shareValue ?? `about ${pctText(share.share)}`}</dd></div>
            ) : (
              <div><dt><SlowdownTerm>Sustained slowdown</SlowdownTerm></dt><dd>{pctText(cell.sd[0] + cell.sd[1])}</dd></div>
            )}
          </dl>
          {activeNotice ? <p className="tool-reading-sub">{activeNotice}</p> : null}
          <ReadingFoot badge={<EvidenceTag kind="data" />} />
          <p className="print-only projector-entered">
            Entered: {formatDuration(E, true)} at {matName(mat, units)}{prev !== null ? `, ${formatDuration(prev, true)} at ${matName(mat - 5, units)}` : ''}{start !== null ? `, start ${formatClock(start)}` : ''}{target !== null ? `, target ${targetText(target)}` : ''}.
          </p>
        </section>
    );
    results = (
      <>
        <section className="tool-panel projector-ended" aria-labelledby="projector-ended-title">
          {/* Only the new fact (the card gives the range and the median): what even pace makes, and how many of these
              finishes made it (round 6: the median was said three times in two screens). Read from the published
              percentiles, so "about". */}
          <p className="tool-nugget-text" id="projector-ended-title">
            Held to the finish, this pace makes {formatDuration(P, true)};{' '}
            <em>{heldShare.bound === 'below' ? '5% or fewer' : heldShare.bound === 'above' ? 'more than 95%' : `about ${pctText(heldShare.share)}`}</em> of these finishes did.
          </p>
          <FinishChart q={cell.q} Q={Q} P={P} target={passed ? null : target} targetTag={targetTag} />
        </section>

        <section className="tool-panel projector-next" aria-labelledby={matRows.length ? 'projector-next-title' : undefined} aria-label={matRows.length ? undefined : 'Race day'}>
          {matRows.length ? <header className="tool-panel-head">
            <h2 className="tool-panel-title" id="projector-next-title">{showClock ? 'When to look up at each mat' : 'The rest of the race, mat by mat'}</h2>
            <p className="tool-panel-meta">{showClock ? 'Clock times' : 'Elapsed times'}: where the middle 80% of these finishes passed, and their median.</p>
          </header> : null}
          {matRows.length ? <ol className="tool-laps projector-laps">
            {matRows.map((r) => (
              <li key={r.km} className={r.km > 42 ? 'is-finish' : undefined}>
                <span>{r.km > 42 ? 'Finish' : `${r.km}K`}{r.km < 42 && units === 'mi' ? <small>{matMiles(r.km)}</small> : null}</span>
                <b>{breakable(span(r.lo, r.hi))}</b>
                <small className="projector-lap-median">median {at(r.mid)}</small>
              </li>
            ))}
            {/* At the next mat, the tracker's new time goes in the same field: the list's last row moves the mat on. */}
            {E !== null && mat < 40 ? (
              <li className="projector-advance-row no-print">
                <button type="button" className="projector-link-button projector-advance" onClick={advance}>Passed {matName(mat + 5, units)}? Next mat <Arrow /></button>
              </li>
            ) : null}
          </ol> : null}
          {/* Clock times and runner cards wait in one disclosure, open once a start time is kept. */}
          <details className="tool-more projector-extras no-print" open={extrasOpen} onToggle={(e) => setExtrasOpen(e.currentTarget.open)}>
            <summary>Clock times and runner cards</summary>
            <div className="tool-more-body">
              <div className="projector-clock no-print">
                <div className="tool-field projector-start">
                  <label htmlFor="projector-start">Start-line crossing time <span className="projector-optional">optional</span></label>
                  <input id="projector-start" inputMode="text" autoComplete="off" value={startText}
                    aria-invalid={startText.trim() !== '' && start === null ? true : undefined} aria-describedby="projector-start-hint"
                    onChange={(e) => saveStart(e.target.value)} />
                  <p className="tool-field-hint" id="projector-start-hint">
                    {/* The example lives in the hint, not a placeholder that reads as an entered time. */}
                    {startText.trim() !== '' && start === null ? 'Try 9:14 am or 09:14.' : 'For clock times, e.g. 9:14 am. Kept on this device for 12 hours.'}
                  </p>
                </div>
                {start !== null ? <Choice label="Show times as" small value={clockView} onChange={setClockView} options={[{ value: 'clock', label: 'Clock' }, { value: 'elapsed', label: 'Elapsed' }]} /> : null}
              </div>
              <div className="projector-save no-print">
                <p className="projector-save-title">Following someone on race day?</p>
                {cards.length >= MAX_CARDS ? <p className="tool-field-hint">Four runner cards are saved. Remove one to add another.</p> : (
                  <div className="projector-save-row">
                    <label htmlFor="projector-card-label" className="sr-only">Card label</label>
                    <input id="projector-card-label" maxLength={40} autoComplete="off" placeholder="Label, e.g. Sam" value={cardLabel} onChange={(e) => setCardLabel(e.target.value)} />
                    <button type="button" className="btn btn-secondary" onClick={saveCard}>Save runner card</button>
                  </div>
                )}
                <p className="tool-field-hint">Cards stay in this browser, so you can update each runner at every mat. Labels never go into links.</p>
              </div>
            </div>
          </details>
        </section>
      </>
    );
  }
  const settledStatus = useSettled(status, 500);

  return (
    <div className="projector" ref={workspaceRef}>
      {cards.length && index ? (
        <section className="tool-panel projector-following" aria-labelledby="projector-following-title">
          <header className="tool-panel-head">
            <h2 className="tool-panel-title" id="projector-following-title">Runners you’re following</h2>
          </header>
          <ul className="projector-cards ph-no-capture">
            {cards.map((card) => (
              <RunnerCardView key={card.id} card={card} index={index} units={units}
                onUpdate={(next) => updateCards(cards.map((c) => (c.id === card.id ? next : c)))}
                onRemove={() => updateCards(cards.filter((c) => c.id !== card.id))}
                onOpen={() => openCard(card)} />
            ))}
          </ul>
        </section>
      ) : null}
      <div className="tool-workspace">
        <div className="tool-results tool-answer" id="projector-result">{answer}</div>
        <form className="tool-inputs projector-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Projector inputs">
          <h2>From the tracker</h2>
          <MatChips mat={mat} units={units} onChange={chooseMat} />
          <div className="projector-entry">
            <Choice label="Enter" small value={entry} onChange={(v) => {
              if (v === 'pace') { paceUnits.current = units; setPaceTyped(E !== null ? Math.round(perUnit(E / mat, units)) : null); }
              setEntry(v);
            }} options={[{ value: 'time', label: 'Elapsed time' }, { value: 'pace', label: 'Average pace' }]} />
            {entry === 'time' ? (
              <ElapsedField id="projector-time" label={`Time at ${matName(mat, units)}`} large value={E} inputRef={timeRef}
                onChange={(s) => { setExampleTime(false); setQ({ t: s === null ? 'none' : elapsedText(s) }); }} placeholder={mat <= 10 ? '0:49:30' : '2:21:30'}
                hint="Chip time as the tracker shows it." />
            ) : (
              <DurationField label={`Average pace so far, per ${units === 'mi' ? 'mile' : 'kilometre'}`} mode="pace" large value={paceTyped}
                onChange={(s) => { setExampleTime(false); setPaceTyped(s); setQ({ t: s === null ? 'none' : elapsedText(perKm(s, units) * mat) }); }}
                placeholder={units === 'mi' ? '9:06' : '5:39'} hint={E !== null ? `Read as ${formatDuration(E, true)} at ${matName(mat, units)}.` : 'As the tracker shows it.'} />
            )}
            {quick ? <div className={`projector-quick${jump ? ' is-jump' : ''}`}>{quick}</div> : null}
          </div>
          <details className="tool-more projector-more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
            <summary>Course, earlier mat, target, splits</summary>
            <div className="tool-more-body">
              <div className="tool-field">
                <label htmlFor="projector-course">Course</label>
                <select id="projector-course" value={scope} onChange={(e) => { setCourseNotice(false); setQ({ course: e.target.value }); }} disabled={!index}
                  aria-describedby={courseNotice ? 'projector-course-hint' : undefined}>
                  {index ? index.scopes.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.city ?? 'All courses'}</option>
                  )) : <option value={scope}>All courses</option>}
                </select>
                {courseNotice ? <p className="tool-field-hint" id="projector-course-hint">The linked course is not in the projector data, so All courses is shown.</p> : null}
              </div>
              {mat > 5 ? (
                <ElapsedField id="projector-prev" label={<>Time at {matName(mat - 5, units)} <span className="projector-optional">optional</span></>} value={prevRaw}
                  onChange={(s) => setQ({ prev: s === null ? '' : elapsedText(s) })} placeholder="h:mm:ss" error={prevError}
                  hint={trend ? `Last 5K at ${paceText(trend.lastPace, units)}: ${trend.r >= 0 ? '+' : '−'}${Math.abs(trend.r * 100).toFixed(1)}% against the average so far.${Math.abs(trend.r) > 0.3 ? ' That is an unusually large change: check both times.' : ''}` : 'Adds the trend of the last 5K.'} />
              ) : null}
              <DurationField label={<>Target finish <span className="projector-optional">optional</span></>} value={targetRaw}
                onChange={(s) => setQ({ target: s === null ? '' : targetText(Math.round(s)) })} placeholder="4:00" hint="Hours and minutes, e.g. 3:59." error={targetError} />
              <div className="tool-field projector-pref">
                <label htmlFor="projector-compare">Compare with finishes on</label>
                <select id="projector-compare" value={pref} onChange={(e) => setQ({ v: e.target.value })} aria-describedby="projector-compare-hint">
                  {prefOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="tool-field-hint" id="projector-compare-hint">{compareHint}</p>
              </div>
              <PasteBox onRead={onPaste} units={units} />
            </div>
          </details>
        </form>

        <div className="tool-results">
          <p className="sr-only" role="status">{settledStatus}</p>
          {results}
        </div>
      </div>
    </div>
  );
}

