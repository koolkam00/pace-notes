'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DataState, DurationField, EvidencePanel, ShareBar, Stat } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight } from '@/lib/insights';
import { loadShard, shareUnder, type ProjectorIndex, type ProjectorShard } from '@/lib/tools/data';
import { HALF_KM, MARATHON_KM, perKm, perUnit, unitKm } from '@/lib/tools/pace';
import { REALISTIC_B, RIEGEL_B, TANDA_RANGE_S, marathonRange, personalExponent, riegel, tandaPace, timeForVdot, vdot, type MarathonRange } from '@/lib/tools/predictor';
import { formatDuration, formatHM, parseDuration } from '@/lib/tools/time';
import { count } from '@/lib/viz/format';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const INDEX_PATH = 'tools/projector.json';
const SHARD_PATH = 'tools/projector/all/20.json';
const VIOLET = '#7A4DFF';
const VIOLET_INK = '#5B34D6';
const DATA = '#FF5B2E';
const DATA_SOFT = '#FFB59C';
/** Plausible race paces (s/km): 2:30 to 25:00 per km. Also used to read "22:30" as minutes for a 5K and "1:55" as hours for a half. */
const PACE_MIN = 150;
const PACE_MAX = 1500;
const TANDA_SE_S = 240;

interface Preset { key: string; label: string; name: string; km: number }
const RACES: Preset[] = [
  { key: '5k', label: '5K', name: '5K', km: 5 },
  { key: '10k', label: '10K', name: '10K', km: 10 },
  { key: '10mi', label: '10 mi', name: '10-mile race', km: 10 * KM_PER_MILE },
  { key: 'half', label: 'Half', name: 'half marathon', km: HALF_KM },
];
const TARGETS: Preset[] = [
  { key: 'marathon', label: 'Marathon', name: 'marathon', km: MARATHON_KM },
  { key: 'half', label: 'Half', name: 'half marathon', km: HALF_KM },
  { key: '10k', label: '10K', name: '10K', km: 10 },
];
const AGO = [
  { value: '', label: 'In the last 3 months' },
  { value: '3-6', label: '3 to 6 months ago' },
  { value: '6+', label: 'More than 6 months ago' },
];
const DEFAULTS = { d: 'half', km: '', t: '1:55:00', ago: '', to: 'marathon', d2: '', km2: '', t2: '', ago2: '', wk: '', tp: '' };
type Query = typeof DEFAULTS;
type LookKey = 'median' | 'riegel' | 'low' | 'high';
interface Look { key: LookKey; label: string; chip: string; seconds: number }

const fmtTime = (s: number) => formatDuration(s, s >= 3600);
/** "4:12" for times over an hour (to the minute), "50:10" under. */
const fmtShort = (s: number) => (s >= 3600 ? formatHM(s) : formatDuration(s));
const fmtPace = (secondsPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(secondsPerKm, units))}/${units}`;
const fmtKm = (km: number, units: UnitSystem) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(units === 'mi' ? km / KM_PER_MILE : km)} ${units}`;
const pctText = (x: number) => (x > 0 && x < 0.01 ? 'under 1%' : `${Math.round(x * 100)}%`);
const qIndex = (Q: number[], p: number) => Q.findIndex((v) => Math.abs(v - p) < 1e-9);

function rangeText(lo: number, hi: number): [string, string] {
  const a = fmtShort(lo);
  const b = fmtShort(hi);
  return a === b ? [fmtTime(lo), fmtTime(hi)] : [a, b];
}

/** "22 min 30 s" / "1 h 55 min" — how a typed time was read. */
function spoken(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : '', sec ? `${sec} s` : ''].filter(Boolean).join(' ') || '0 s';
}

/**
 * Read a race time the way runners type it for this distance: "22:30" is minutes for a 5K, "1:55" is hours for a half.
 * Only two-group times are ambiguous; the reading that gives a plausible pace wins.
 */
export function parseRaceTime(text: string, km: number | null): number | null {
  const long = parseDuration(text, 'race');
  const short = parseDuration(text, 'pace');
  if (long === null || short === null || long === short || km === null) return long ?? short;
  const plausible = (s: number) => s / km >= PACE_MIN && s / km <= PACE_MAX;
  if (plausible(long)) return long;
  if (plausible(short)) return short;
  return long;
}

interface Distance { key: string; km: number | null; preset: Preset | null }

function resolveDistance(key: string, km: string): Distance {
  const preset = RACES.find((r) => r.key === key);
  if (preset) return { key, km: preset.km, preset };
  // Compatibility with numeric links such as ?d=21.0975.
  const numeric = key && key !== 'custom' ? Number(key) : NaN;
  if (Number.isFinite(numeric) && numeric > 0) {
    const match = RACES.find((r) => Math.abs(r.km - numeric) < 0.01);
    return match ? { key: match.key, km: match.km, preset: match } : { key: 'custom', km: numeric, preset: null };
  }
  const v = Number(km);
  return { key: 'custom', km: km !== '' && Number.isFinite(v) && v > 0 ? v : null, preset: null };
}

function resolveTarget(key: string): Preset {
  const direct = TARGETS.find((t) => t.key === key);
  if (direct) return direct;
  const numeric = Number(key);
  return TARGETS.find((t) => Math.abs(t.km - numeric) < 0.01) ?? TARGETS[0];
}

const raceName = (d: Distance, units: UnitSystem) => (d.preset ? d.preset.name : d.km ? `${fmtKm(d.km, units)} race` : 'race');
const nameForKm = (km: number, units: UnitSystem) => RACES.find((r) => Math.abs(r.km - km) < 0.01)?.name ?? `${fmtKm(km, units)} race`;
const withArticle = (name: string) => (/^(8|1[18]|a|e|i|o|u)/i.test(name) ? `an ${name}` : `a ${name}`);

type RaceCheck = { ok: true; km: number; seconds: number } | { ok: false; message: string | null };

function checkRace(km: number | null, seconds: number | null, units: UnitSystem): RaceCheck {
  if (km === null) return { ok: false, message: 'Enter the race distance.' };
  if (km < 1.5) return { ok: false, message: `Use a race of at least ${fmtKm(1.5, units)}.` };
  if (km > MARATHON_KM + 1e-6) return { ok: false, message: 'Use a race no longer than a marathon.' };
  if (seconds === null) return { ok: false, message: null };
  const pace = seconds / km;
  if (pace < PACE_MIN) return { ok: false, message: `That is ${fmtPace(pace, units)}, faster than any world record. Check the time and distance.` };
  if (pace > PACE_MAX) return { ok: false, message: `That is ${fmtPace(pace, units)}. Check the time and distance.` };
  return { ok: true, km, seconds };
}

function niceStep(span: number, target: number, steps: number[]): number {
  for (const s of steps) if (span / s <= target) return s;
  return steps[steps.length - 1];
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

function RaceTimeField({ id, label, text, km, onText, error, hint, large = false, inputRef }: {
  id: string; label: ReactNode; text: string; km: number | null; onText: (text: string) => void;
  error?: string | null; hint?: ReactNode; large?: boolean; inputRef?: RefObject<HTMLInputElement>;
}) {
  const [touched, setTouched] = useState(false);
  const parsed = text.trim() ? parseRaceTime(text, km) : null;
  const invalid = touched && text.trim() !== '' && parsed === null;
  const message = invalid ? 'Try 1:55:00, 1:55 or 22:30.' : error;
  return (
    <div className={`tool-field${large ? ' is-large' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} ref={inputRef} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder={large ? '1:55:00' : 'h:mm:ss'} value={text}
        aria-invalid={invalid || !!error || undefined} aria-describedby={message || hint ? `${id}-hint` : undefined}
        onChange={(e) => onText(e.target.value)}
        onBlur={() => { setTouched(true); if (parsed !== null) onText(fmtTime(parsed)); }} />
      {message ? <p className="tool-field-hint is-error" id={`${id}-hint`}>{message}</p>
        : hint ? <p className="tool-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

/** A distance typed in the visitor's units, reported in km. Keeps the visitor's text while they type. */
function DistanceField({ id, label, km, units, onChange, suffix, hint, error }: {
  id: string; label: ReactNode; km: number | null; units: UnitSystem; onChange: (km: number | null) => void;
  suffix: string; hint?: ReactNode; error?: string | null;
}) {
  const show = (v: number | null) => (v === null ? '' : String(Math.round((v / unitKm(units)) * 100) / 100));
  const [text, setText] = useState(show(km));
  const last = useRef<{ km: number | null; units: UnitSystem }>({ km, units });
  useEffect(() => {
    // Only outside changes (units, presets, shared links) rewrite the text; typing updates `last` first.
    if (km !== last.current.km || units !== last.current.units) {
      last.current = { km, units };
      setText(show(km));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [km, units]);
  return (
    <div className="tool-field">
      <label htmlFor={id}>{label}</label>
      <div className="tool-inline predictor-number">
        <input id={id} inputMode="decimal" autoComplete="off" value={text} aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            const next = e.target.value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * unitKm(units) * 1000) / 1000 : null;
            last.current = { km: next, units };
            onChange(next);
          }} />
        <span>{suffix}</span>
      </div>
      {error ? <p className="tool-field-hint is-error" id={`${id}-hint`}>{error}</p> : hint ? <p className="tool-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

function DistanceChips({ labelId, label, value, onPick }: { labelId: string; label: string; value: string; onPick: (key: string) => void }) {
  return (
    <div className="tool-field">
      <span className="tool-label" id={labelId}>{label}</span>
      <div className="tool-presets predictor-chips" role="group" aria-labelledby={labelId}>
        {RACES.map((r) => <button key={r.key} type="button" aria-pressed={value === r.key} onClick={() => onPick(r.key)}>{r.label}</button>)}
        <button type="button" aria-pressed={value === 'custom'} onClick={() => onPick('custom')}>Other</button>
      </div>
    </div>
  );
}

function AgoSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tool-field tool-select">
      <label htmlFor={id}>When you ran it</label>
      <select id={id} value={AGO.some((a) => a.value === value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
        {AGO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estimates                                                           */
/* ------------------------------------------------------------------ */

interface Personal { b: number; seconds: number | null; fromKm: number; fromS: number; warnings: string[] }
interface Tanda { seconds: number | null; inRange: boolean; k: number; p: number }

interface Estimates {
  target: Preset;
  isMarathon: boolean;
  fromKm: number;
  fromS: number;
  riegel: number;
  daniels: number;
  danielsB: number;
  range: MarathonRange | null;
  personal: Personal | { error: string } | null;
  tanda: Tanda | { error: string } | null;
}

function estimate(target: Preset, race: { km: number; seconds: number }, race2: RaceCheck | null, ago: string, ago2: string, wk: number | null, tp: number | null, units: UnitSystem): Estimates {
  const isMarathon = target.key === 'marathon';
  const r = riegel(race.seconds, race.km, target.km);
  const d = timeForVdot(vdot(race.km, race.seconds), target.km);
  let personal: Estimates['personal'] = null;
  if (race2 && race2.ok) {
    if (Math.abs(race2.km - race.km) < 0.05) personal = { error: 'Use two different distances to fit an exponent.' };
    else {
      const b = personalExponent(race.km, race.seconds, race2.km, race2.seconds);
      const long = race.km > race2.km ? { km: race.km, s: race.seconds } : { km: race2.km, s: race2.seconds };
      const warnings: string[] = [];
      const usable = b > 0.9 && b < 1.5;
      if (!usable) warnings.push(`These two races give an exponent of ${b.toFixed(2)}, too far from the usual 1.00 to 1.30 to apply. Check both times and distances.`);
      else if (b < 1 || b > 1.3) warnings.push(`An exponent of ${b.toFixed(2)} is outside the usual 1.00 to 1.30. Check both times, and whether either race was hilly, hot or not run all-out.`);
      if ((ago === '6+' && ago2 === '') || (ago === '' && ago2 === '6+')) warnings.push('These races may be more than 6 months apart; a change in fitness between them distorts the exponent.');
      personal = { b, seconds: usable ? riegel(long.s, long.km, target.km, b) : null, fromKm: long.km, fromS: long.s, warnings };
    }
  }
  let tanda: Estimates['tanda'] = null;
  if (isMarathon && (wk !== null || tp !== null)) {
    if (wk === null || tp === null) tanda = { error: wk === null ? 'Add your weekly distance too.' : 'Add your average training pace too.' };
    else if (wk < 8 || wk > 300) tanda = { error: `Weekly distance should be between ${fmtKm(8, units)} and ${fmtKm(300, units)}.` };
    else if (tp < 180 || tp > 900) tanda = { error: `Training pace should be between ${fmtPace(180, units)} and ${fmtPace(900, units)}.` };
    else {
      const seconds = tandaPace(wk, tp) * MARATHON_KM;
      const inRange = seconds >= TANDA_RANGE_S[0] && seconds <= TANDA_RANGE_S[1];
      tanda = { seconds: inRange ? seconds : null, inRange, k: wk, p: tp };
    }
  }
  return {
    target, isMarathon, fromKm: race.km, fromS: race.seconds, riegel: r, daniels: d,
    danielsB: Math.log(d / race.seconds) / Math.log(target.km / race.km),
    range: isMarathon ? marathonRange(race.km, race.seconds) : null,
    personal, tanda,
  };
}

/* ------------------------------------------------------------------ */
/* Method chart (a forest plot of every method)                       */
/* ------------------------------------------------------------------ */

interface ChartRow {
  key: string; label: string; detail: string; value: string;
  kind: 'point' | 'range' | 'none';
  at?: number; lo?: number; mid?: number; hi?: number; whisker?: number;
  tone: 'ink' | 'outline' | 'violet';
  tip: string[];
}

function MethodChart({ rows, fuzzy, label }: { rows: ChartRow[]; fuzzy: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 560;
  const [active, setActive] = useState<string | null>(null);
  const vals: number[] = [];
  for (const r of rows) {
    if (r.kind === 'point' && r.at !== undefined) vals.push(r.at - (r.whisker ?? 0), r.at + (r.whisker ?? 0));
    if (r.kind === 'range' && r.lo !== undefined && r.hi !== undefined) vals.push(r.lo, r.hi);
  }
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const centre = (min + max) / 2;
  const span = Math.max(max - min, centre * 0.05);
  const lo = centre - span / 2 - span * 0.12;
  const hi = centre + span / 2 + span * 0.12;
  const m = { l: 10, r: 10, t: 4, b: 30 };
  const rowH = narrow ? 62 : 48;
  const plotBottom = m.t + rows.length * rowH;
  const H = plotBottom + m.b;
  const x = (s: number) => m.l + ((s - lo) / (hi - lo)) * (width - m.l - m.r);
  const step = niceStep(hi - lo, narrow ? 4 : 7, [15, 30, 60, 120, 300, 600, 900, 1800, 3600]);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const tickText = (t: number) => (t >= 3600 ? formatHM(t) : formatDuration(t));
  const band = rows.find((r) => r.kind === 'range');
  const rowAt = (clientY: number, svg: SVGSVGElement) => {
    const y = clientY - svg.getBoundingClientRect().top - m.t;
    return rows[Math.floor(y / rowH)]?.key ?? null;
  };
  const activeIndex = rows.findIndex((r) => r.key === active);
  const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;
  const anchor = activeRow ? (activeRow.kind === 'range' ? activeRow.mid! : activeRow.kind === 'point' ? activeRow.at! : (lo + hi) / 2) : 0;
  return (
    <div ref={ref} className="viz predictor-chart">
      <svg width={width} height={H} role="img" aria-label={label}
        onPointerMove={(e) => { if (e.pointerType === 'mouse') setActive(rowAt(e.clientY, e.currentTarget)); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
        onClick={(e) => { const k = rowAt(e.clientY, e.currentTarget); setActive((a) => (a === k ? null : k)); }}>
        <defs>
          <linearGradient id="predictor-span" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={VIOLET} stopOpacity={0.75} />
            <stop offset="1" stopColor={VIOLET} />
          </linearGradient>
          <linearGradient id="predictor-fade-l" x1="1" x2="0" y1="0" y2="0">
            <stop offset="0" stopColor={VIOLET} stopOpacity={0.5} />
            <stop offset="1" stopColor={VIOLET} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="predictor-fade-r" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={VIOLET} stopOpacity={0.5} />
            <stop offset="1" stopColor={VIOLET} stopOpacity={0} />
          </linearGradient>
        </defs>
        {activeRow ? <rect x={0} y={m.t + activeIndex * rowH + 1} width={width} height={rowH - 2} rx={10} className="predictor-row-active" /> : null}
        {band && band.lo !== undefined && band.hi !== undefined ? (
          <g aria-hidden="true">
            <rect x={x(band.lo)} y={m.t} width={Math.max(1, x(band.hi) - x(band.lo))} height={plotBottom - m.t} fill={VIOLET} fillOpacity={0.08} />
            <line x1={x(band.mid!)} x2={x(band.mid!)} y1={m.t} y2={plotBottom} stroke={VIOLET_INK} strokeOpacity={0.55} strokeDasharray="3 4" />
          </g>
        ) : null}
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={x(t)} x2={x(t)} y1={m.t} y2={plotBottom} />
            <text x={x(t)} y={plotBottom + 18} textAnchor="middle">{tickText(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const top = m.t + i * rowH;
          const labelY = top + 16;
          const markY = top + (narrow ? 46 : 35);
          return (
            <g key={r.key} className={`predictor-row is-${r.tone}${r.kind === 'none' ? ' is-none' : ''}`}>
              <text x={m.l} y={labelY} className="predictor-row-label">
                {r.label}{!narrow && r.detail ? <tspan className="predictor-row-detail">{`  ${r.detail}`}</tspan> : null}
              </text>
              {narrow && r.detail ? <text x={m.l} y={labelY + 15} className="predictor-row-detail">{r.detail}</text> : null}
              <text x={width - m.r} y={labelY} textAnchor="end" className="predictor-row-value">{r.value}</text>
              <line x1={m.l} x2={width - m.r} y1={markY} y2={markY} className="predictor-track" />
              {r.kind === 'range' && r.lo !== undefined && r.hi !== undefined && r.mid !== undefined ? (
                <g>
                  {fuzzy ? <>
                    <rect x={x(r.lo) - 22} y={markY - 6} width={22} height={12} fill="url(#predictor-fade-l)" />
                    <rect x={x(r.hi)} y={markY - 6} width={22} height={12} fill="url(#predictor-fade-r)" />
                  </> : null}
                  <rect x={x(r.lo)} y={markY - 6} width={Math.max(4, x(r.hi) - x(r.lo))} height={12} rx={6} fill="url(#predictor-span)" />
                  <line x1={x(r.mid)} x2={x(r.mid)} y1={markY - 11} y2={markY + 11} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
                </g>
              ) : null}
              {r.kind === 'point' && r.at !== undefined ? (
                <g>
                  {r.whisker ? (
                    <g className="predictor-whisker">
                      <line x1={x(r.at - r.whisker)} x2={x(r.at + r.whisker)} y1={markY} y2={markY} />
                      <line x1={x(r.at - r.whisker)} x2={x(r.at - r.whisker)} y1={markY - 5} y2={markY + 5} />
                      <line x1={x(r.at + r.whisker)} x2={x(r.at + r.whisker)} y1={markY - 5} y2={markY + 5} />
                    </g>
                  ) : null}
                  {r.tone === 'outline'
                    ? <circle cx={x(r.at)} cy={markY} r={6} fill="var(--card)" stroke="var(--ink)" strokeWidth={2.5} />
                    : <circle cx={x(r.at)} cy={markY} r={6.5} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />}
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      {activeRow ? (
        <div className="viz-tooltip predictor-tip" aria-hidden="true" style={{ left: Math.min(width - 96, Math.max(96, x(anchor))), top: m.t + activeIndex * rowH + (narrow ? 36 : 25) }}>
          <b>{activeRow.label}</b>
          {activeRow.tip.map((line) => <span key={line}>{line}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pace Notes data: what happened to finishes on this pace at 20 km    */
/* ------------------------------------------------------------------ */

function useProjector(sha: string | null, enabled: boolean) {
  const [state, setState] = useState<{ index: ProjectorIndex | null; shard: ProjectorShard | null; error: string | null }>({ index: null, shard: null, error: null });
  const started = useRef(false);
  useEffect(() => {
    if (!sha || !enabled || started.current) return;
    started.current = true;
    loadInsight<ProjectorIndex>(INDEX_PATH, sha)
      .then((index) => loadShard<ProjectorShard>(index, SHARD_PATH).then((shard) => ({ index, shard })))
      .then(
        ({ index, shard }) => setState({ index, shard, error: null }),
        () => { started.current = false; setState({ index: null, shard: null, error: 'The Pace Notes data could not be loaded or verified, so this panel is unavailable. The published estimates above are unaffected.' }); },
      );
  }, [sha, enabled]);
  return state;
}

interface Marker { key: string; x: number; label: string; tone: 'est' | 'median' }

function stackLabels(markers: Marker[], width: number, margin: number) {
  const charW = 6.9;
  const rows: number[] = [];
  return [...markers].sort((a, b) => a.x - b.x).map((mk) => {
    const w = mk.label.length * charW;
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    let x0 = mk.x - w / 2;
    if (x0 < margin) { anchor = 'start'; x0 = mk.x - 2; }
    if (x0 + w > width - margin) { anchor = 'end'; x0 = mk.x - w + 2; }
    let row = rows.findIndex((end) => end + 12 < x0);
    if (row < 0) { row = rows.length; rows.push(x0 + w); } else rows[row] = x0 + w;
    return { ...mk, anchor, row, w };
  });
}

function FinishStrip({ q, Q, est, estLabel }: { q: number[]; Q: number[]; est: number; estLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const i10 = qIndex(Q, 0.1); const i25 = qIndex(Q, 0.25); const i50 = qIndex(Q, 0.5); const i75 = qIndex(Q, 0.75); const i90 = qIndex(Q, 0.9);
  const lo0 = Math.min(q[0], est);
  const hi0 = Math.max(q[q.length - 1], est);
  const pad = Math.max(hi0 - lo0, 900) * 0.06;
  const [lo, hi] = [lo0 - pad, hi0 + pad];
  const m = { l: 8, r: 8 };
  const x = (s: number) => m.l + ((s - lo) / (hi - lo)) * (width - m.l - m.r);
  const fmt = narrow ? fmtShort : fmtTime;
  const markers = stackLabels([
    { key: 'est', x: x(est), label: `${estLabel} ${fmt(est)}`, tone: 'est' as const },
    { key: 'median', x: x(q[i50]), label: `Their median ${fmt(q[i50])}`, tone: 'median' as const },
  ], width, m.l);
  const labelRows = Math.max(1, ...markers.map((mk) => mk.row + 1));
  const top = 8 + labelRows * 17;
  const plotH = narrow ? 80 : 96;
  const base = top + plotH;
  const H = base + 34;
  const dens = q.slice(0, -1).map((v, i) => 0.05 / Math.max(1, q[i + 1] - v));
  const maxD = Math.max(...dens);
  const step = niceStep(hi - lo, narrow ? 4 : 7, [60, 120, 300, 600, 900, 1800, 3600]);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const label = `Finish times of these finishes, in 5% slices: 10th percentile ${fmtTime(q[i10])}, median ${fmtTime(q[i50])}, 90th percentile ${fmtTime(q[i90])}. The ${estLabel.toLowerCase()} of ${fmtTime(est)} is marked.`;
  return (
    <div ref={ref} className="viz predictor-strip">
      <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={x(t)} x2={x(t)} y1={top - 2} y2={base} />
            <text x={x(t)} y={base + 18} textAnchor="middle">{fmtShort(t)}</text>
          </g>
        ))}
        {dens.map((dv, i) => {
          const h = (dv / maxD) * (plotH - 6);
          const middle = i >= i25 && i < i75;
          return <rect key={i} x={x(q[i])} width={Math.max(0.5, x(q[i + 1]) - x(q[i]))} y={base - h} height={h} fill={middle ? DATA : DATA_SOFT} stroke="var(--card)" strokeWidth={0.75} />;
        })}
        <line x1={m.l} x2={width - m.r} y1={base} y2={base} stroke="var(--ink-3)" />
        <g className="predictor-strip-whisker">
          <line x1={x(q[i10])} x2={x(q[i90])} y1={base + 6} y2={base + 6} />
          <line x1={x(q[i10])} x2={x(q[i10])} y1={base + 2} y2={base + 10} />
          <line x1={x(q[i90])} x2={x(q[i90])} y1={base + 2} y2={base + 10} />
        </g>
        {markers.map((mk) => (
          <line key={mk.key} x1={mk.x} x2={mk.x} y1={14 + mk.row * 17 + 4} y2={base} stroke={mk.tone === 'est' ? VIOLET_INK : 'var(--ink)'}
            strokeWidth={mk.tone === 'median' ? 2 : 1.75} strokeDasharray={mk.tone === 'est' ? '4 3' : undefined} />
        ))}
        {markers.map((mk) => {
          const left = mk.anchor === 'start' ? mk.x - 3 : mk.anchor === 'end' ? mk.x - mk.w - 3 : mk.x - mk.w / 2 - 3;
          return (
            <g key={mk.key}>
              <rect x={left} y={14 + mk.row * 17 - 12} width={mk.w + 6} height={16} fill="var(--card)" />
              <text x={mk.x} y={14 + mk.row * 17} textAnchor={mk.anchor} className="predictor-marker" style={{ fill: mk.tone === 'est' ? VIOLET_INK : 'var(--ink)' }}>{mk.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ObservedPanel({ indexSha, est, looks, look, setLook, units }: {
  indexSha: string | null; est: Estimates; looks: Look[]; look: LookKey; setLook: (k: LookKey) => void; units: UnitSystem;
}) {
  const { index, shard, error } = useProjector(indexSha, est.isMarathon);
  const title = 'What happened to finishes on this pace at 20 km';
  if (!est.isMarathon) {
    return (
      <EvidencePanel kind="data" title="Nothing to add for this distance" id="predictor-data">
        <p className="predictor-copy">Pace Notes holds marathons only, so it has no finishes to show for {withArticle(est.target.name)} target. Switch the prediction to a marathon to see what happened to finishes that passed 20 km on the estimated pace.</p>
      </EvidencePanel>
    );
  }
  if (!indexSha) {
    return (
      <EvidencePanel kind="data" title={title} id="predictor-data">
        <p className="tool-state">The Pace Notes data is not part of this build, so this panel is unavailable. The published estimates above still work.</p>
      </EvidencePanel>
    );
  }
  const chosen = looks.find((l) => l.key === look) ?? looks[0];
  const T = chosen.seconds;
  const bandS = index?.band_s ?? 120;
  const band = Math.floor(T / bandS) * bandS;
  const cells = shard?.cells.all;
  const i = cells ? cells.b.indexOf(band) : -1;
  const Q = index?.quantiles ?? [];
  const i10 = qIndex(Q, 0.1); const i50 = qIndex(Q, 0.5); const i90 = qIndex(Q, 0.9);
  const lookChoice = (
    <div className="predictor-look no-print">
      <span className="tool-label" id="predictor-look-label">Even pace at 20 km for</span>
      <div className="segmented tool-choice is-small" role="group" aria-labelledby="predictor-look-label">
        {looks.map((l) => <button key={l.key} type="button" aria-pressed={l.key === chosen.key} onClick={() => setLook(l.key)}>{l.chip} <b>{fmtShort(l.seconds)}</b></button>)}
      </div>
    </div>
  );
  const bandRange = `${fmtShort(band)}–${fmtShort(band + bandS)}`;
  const at20 = (s: number) => formatDuration((s * 20) / MARATHON_KM, true);
  const meta = (
    <>All courses. Complete finishes whose 20 km time put them on {bandRange} even pace (20 km in {at20(band)} to {at20(band + bandS)}), the pace of the {chosen.label.toLowerCase()}. This describes those finishes, not you.</>
  );
  const scope = index?.scopes.find((s) => s.slug === 'all');
  const bands = scope?.mats['20']?.bands ?? null;
  return (
    <EvidencePanel kind="data" title={title} meta={meta} id="predictor-data">
      {lookChoice}
      <DataState error={error} loading={!error && (!index || !shard)}>
        {cells && i >= 0 ? (() => {
          const q = cells.q[i];
          const share = shareUnder(T, q, Q);
          const sd = cells.sd[i][0] + cells.sd[i][1];
          const shareText = share.bound === 'below' ? '5% or fewer' : share.bound === 'above' ? 'more than 95%' : pctText(share.share);
          return (
            <>
              <div className="predictor-observed">
                <Stat label="Their median finish" value={formatDuration(q[i50], true)} sub={<>10th–90th percentile <b>{fmtTime(q[i10])}</b> to <b>{fmtTime(q[i90])}</b></>} />
                <Stat label={`Finished under ${fmtTime(T)}`} value={shareText} sub="observed share of these complete finishes" />
                <Stat label="Sustained slowdown" value={pctText(sd)} sub="of these finishes, after 20 km" />
              </div>
              <FinishStrip q={q} Q={Q} est={T} estLabel={chosen.label} />
              <p className="predictor-copy">
                Through 20 km these finishes averaged {fmtPace(band / MARATHON_KM, units)} to {fmtPace((band + bandS) / MARATHON_KM, units)}. Over the rest of the race their median pace was <b>{fmtPace(cells.rp[i], units)}</b>.
                {' '}Each bar holds 5% of the finishes; the darker bars are the middle half.
              </p>
              <p className="tool-note">
                <strong>{count(cells.n[i])} finishes from {count(cells.ed[i])} race editions.</strong> They include every runner who passed 20 km on this pace, whatever their training, goal or weather: a reality check on fading, not a prediction. Shares are interpolated between stored percentiles. Runners who stopped are not in the data. A sustained slowdown is a 5 km section after 20 km at least 25% slower than the runner’s own 5–20 km pace, with contiguous slowed sections totalling at least 5 km (<a href="https://doi.org/10.1371/journal.pone.0251513" rel="noopener noreferrer">published method</a>).
              </p>
              <p className="predictor-copy no-print">
                <Link href={`/tools/projector?mat=20&t=${at20(T)}&target=${fmtShort(T)}&v=all`}>Open this group in the race-day projector</Link> for the arrival windows at each later mat, or to pick one course.
              </p>
            </>
          );
        })() : (
          <p className="tool-state">
            Fewer than 100 finishes passed 20 km on {bandRange} even pace, so nothing is shown for this pace.
            {bands ? ` Groups at 20 km are published for even paces from about ${fmtShort(bands[0])} to ${fmtShort(bands[1] + bandS)}.` : ''}
          </p>
        )}
      </DataState>
    </EvidencePanel>
  );
}

/* ------------------------------------------------------------------ */
/* The tool                                                            */
/* ------------------------------------------------------------------ */

export default function Predictor({ indexSha }: { indexSha: string | null }) {
  const { units } = useUnits();
  const [q, setQ, ready] = useQueryState<Query>(DEFAULTS);
  const [converted, setConverted] = useState<string | null>(null);
  const [open2, setOpen2] = useState(false);
  const [openT, setOpenT] = useState(false);
  const [look, setLook] = useState<LookKey>('median');
  const race2Ref = useRef<HTMLInputElement>(null);
  const tandaRef = useRef<HTMLDetailsElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!ready) return;
    if (q.t2) setOpen2(true);
    if (q.wk || q.tp) setOpenT(true);
    // Open the disclosures that a shared link fills, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const target = resolveTarget(q.to);
  const dist1 = resolveDistance(q.d, q.km);
  const t1 = parseRaceTime(q.t, dist1.km);
  const race1 = checkRace(dist1.km, t1, units);
  const sameAsTarget = race1.ok && Math.abs(race1.km - target.km) < 0.05;

  const d2Default = dist1.key === 'half' ? '10k' : 'half';
  const dist2 = resolveDistance(q.d2 || d2Default, q.km2);
  const t2 = q.t2.trim() ? parseRaceTime(q.t2, dist2.km) : null;
  const race2 = q.t2.trim() ? checkRace(dist2.km, t2, units) : null;

  const wk = q.wk && Number(q.wk) > 0 ? Number(q.wk) : null;
  const tp = q.tp && Number(q.tp) > 0 ? Number(q.tp) : null;

  const est = race1.ok && !sameAsTarget ? estimate(target, race1, race2, q.ago, q.ago2, wk, tp, units) : null;

  const pickDistance = (key: string) => {
    if (key === dist1.key) return;
    const nextKm = key === 'custom' ? (dist1.km ?? 15) : RACES.find((r) => r.key === key)!.km;
    const patch: Partial<Query> = { d: key, km: key === 'custom' ? String(Math.round(nextKm * 1000) / 1000) : '' };
    if (race1.ok && key !== 'custom') {
      // Keep the result meaningful while the visitor types their own time: Riegel-equivalent at the new distance.
      const next = Math.round(riegel(race1.seconds, race1.km, nextKm));
      patch.t = fmtTime(next);
      setConverted(`Filled in from your ${fmtTime(race1.seconds)} ${raceName(dist1, units)} with Riegel 1.06. Type your own ${RACES.find((r) => r.key === key)!.name} time.`);
    }
    setQ(patch);
  };

  const pace1 = race1.ok ? race1.seconds / race1.km : null;
  const timeHint = converted ?? (race1.ok && t1 !== null ? `Read as ${spoken(t1)} · ${fmtPace(pace1!, units)}` : 'h:mm:ss, or mm:ss for short races');
  const race1Error = !race1.ok ? race1.message : null;

  // Rows for the chart and the method table.
  const rows: ChartRow[] = [];
  const looks: Look[] = [];
  if (est) {
    const pace = (s: number) => fmtPace(s / est.target.km, units);
    rows.push({
      key: 'riegel', label: `Riegel ${RIEGEL_B.toFixed(2)}`, detail: est.isMarathon ? 'best case if fully marathon-trained' : 'classic power law',
      value: fmtTime(est.riegel), kind: 'point', at: est.riegel, tone: 'ink',
      tip: [`${fmtTime(est.riegel)} · ${pace(est.riegel)}`, est.isMarathon ? 'A median 10:09 too fast for recreational runners (Vickers & Vertosick 2016).' : 'Well calibrated up to the half (Vickers & Vertosick 2016).'],
    });
    rows.push({
      key: 'daniels', label: 'Daniels–Gilbert', detail: 'the equations behind VDOT',
      value: fmtTime(est.daniels), kind: 'point', at: est.daniels, tone: 'ink',
      tip: [`${fmtTime(est.daniels)} · ${pace(est.daniels)}`, `Implies an exponent of ${est.danielsB.toFixed(3)} here.`],
    });
    if (est.range) {
      const r = est.range;
      const [a, b] = rangeText(r.low, r.high);
      rows.push({
        key: 'range', label: 'Half-to-full exponents', detail: `typical range ${REALISTIC_B.low}–${REALISTIC_B.high}, median ${REALISTIC_B.median}`,
        value: `${a}–${b}`, kind: 'range', lo: r.low, mid: r.median, hi: r.high, tone: 'violet',
        tip: [`${fmtTime(r.low)} to ${fmtTime(r.high)}`, `Median exponent ${REALISTIC_B.median}: ${fmtTime(r.median)} · ${pace(r.median)}`, 'From 4,402 runners’ training logs (RunningAHEAD).'],
      });
      looks.push(
        { key: 'median', label: 'Median estimate', chip: 'Median', seconds: r.median },
        { key: 'riegel', label: 'Best case', chip: 'Best case', seconds: est.riegel },
        { key: 'low', label: 'Range start', chip: 'Range start', seconds: r.low },
        { key: 'high', label: 'Range end', chip: 'Range end', seconds: r.high },
      );
    }
    if (est.personal && 'b' in est.personal) {
      const p = est.personal;
      rows.push({
        key: 'personal', label: 'Your two races', detail: `exponent ${p.b.toFixed(2)}`,
        value: p.seconds !== null ? fmtTime(p.seconds) : 'not applied', kind: p.seconds !== null ? 'point' : 'none', at: p.seconds ?? undefined, tone: 'outline',
        tip: p.seconds !== null ? [`${fmtTime(p.seconds)} · ${pace(p.seconds)}`, `Exponent ${p.b.toFixed(3)}, applied from your ${nameForKm(p.fromKm, units)}.`] : ['Outside the range where an exponent means much.'],
      });
    }
    if (est.tanda && 'inRange' in est.tanda) {
      const t = est.tanda;
      rows.push({
        key: 'tanda', label: 'Tanda (2011)', detail: t.inRange ? 'training volume and pace, ±4 min' : 'built on 2:47–3:36 finishes',
        value: t.seconds !== null ? fmtTime(t.seconds) : 'outside its range', kind: t.seconds !== null ? 'point' : 'none', at: t.seconds ?? undefined,
        whisker: t.seconds !== null ? TANDA_SE_S : undefined, tone: 'outline',
        tip: t.seconds !== null ? [`${fmtTime(t.seconds)} · ${pace(t.seconds)}`, 'Standard error about 4 minutes, from 22 runners.'] : ['Outside the range this formula was built on (2:47–3:36), so no number is shown.'],
      });
    }
  }
  const chartLabel = est ? `Predicted ${est.target.name} times by method. ${rows.map((r) => `${r.label}: ${r.kind === 'range' ? `${fmtTime(r.lo!)} to ${fmtTime(r.hi!)}, median ${fmtTime(r.mid!)}` : r.value}`).join('. ')}.` : '';

  const bandTimes = est?.range
    ? [...new Set([est.riegel, est.range.low, est.range.median, est.range.high].map((s) => Math.round(s / 60) * 60))].filter((s) => s >= 5400 && s <= 28800).sort((a, b) => a - b)
    : [];

  const medianMinute = est?.range ? Math.round(est.range.median / 60) * 60 : null;
  const medianGoal = medianMinute !== null && bandTimes.includes(medianMinute) ? medianMinute : null;

  const openSecond = () => { setOpen2(true); setTimeout(() => race2Ref.current?.focus(), 30); };
  const openTanda = () => { setOpenT(true); setTimeout(() => tandaRef.current?.querySelector('input')?.focus(), 30); };

  const stale = [q.ago === '6+' ? 'Your recent race' : null, race2?.ok && q.ago2 === '6+' ? 'Your second race' : null].filter(Boolean) as string[];

  return (
    <div className="predictor">
      <div className="tool-workspace">
        <form className="tool-inputs predictor-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Finish-time predictor inputs">
          <h2>Your recent race</h2>
          <DistanceChips labelId={`${uid}-d1`} label="Distance" value={dist1.key} onPick={pickDistance} />
          {dist1.key === 'custom' ? (
            <DistanceField id={`${uid}-km1`} label="Race distance" km={dist1.km} units={units} suffix={units} onChange={(km) => setQ({ d: 'custom', km: km === null ? '' : String(km) })} />
          ) : null}
          <RaceTimeField id={`${uid}-t1`} label="Finish time" large text={q.t} km={dist1.km} error={race1Error}
            onText={(text) => { setConverted(null); setQ({ t: text }); }} hint={timeHint} />
          <AgoSelect id={`${uid}-ago1`} value={q.ago} onChange={(v) => setQ({ ago: v })} />
          <div className="tool-field">
            <span className="tool-label" aria-hidden="true">Predict</span>
            <Choice label="Distance to predict" value={target.key} onChange={(v) => setQ({ to: v })} options={TARGETS.map((t) => ({ value: t.key, label: t.label }))} />
          </div>

          <details className="predictor-more" open={open2} onToggle={(e) => setOpen2(e.currentTarget.open)}>
            <summary>
              Add a second race <span className="predictor-optional">optional</span>
              {race2?.ok && est?.personal && 'b' in est.personal ? <span className="predictor-summary-value">exponent {est.personal.b.toFixed(2)}</span> : null}
            </summary>
            <div className="predictor-more-body">
              <p className="tool-field-hint">A second race at another distance fits your own exponent, applied from the longer race.</p>
              <DistanceChips labelId={`${uid}-d2`} label="Distance" value={dist2.key} onPick={(key) => setQ({ d2: key, km2: key === 'custom' ? q.km2 || '15' : '' })} />
              {dist2.key === 'custom' ? (
                <DistanceField id={`${uid}-km2`} label="Race distance" km={dist2.km} units={units} suffix={units} onChange={(km) => setQ({ d2: 'custom', km2: km === null ? '' : String(km) })} />
              ) : null}
              <RaceTimeField id={`${uid}-t2`} label="Finish time" text={q.t2} km={dist2.km} inputRef={race2Ref}
                error={race2 && !race2.ok ? race2.message : est?.personal && 'error' in est.personal ? est.personal.error : null}
                hint={race2?.ok && t2 !== null ? `Read as ${spoken(t2)} · ${fmtPace(race2.seconds / race2.km, units)}` : undefined}
                onText={(text) => setQ({ t2: text, d2: q.d2 || dist2.key })} />
              <AgoSelect id={`${uid}-ago2`} value={q.ago2} onChange={(v) => setQ({ ago2: v })} />
              {q.t2 ? <button type="button" className="predictor-link-button" onClick={() => setQ({ t2: '', d2: '', km2: '', ago2: '' })}>Remove the second race</button> : null}
            </div>
          </details>

          <details ref={tandaRef} className="predictor-more" open={openT} onToggle={(e) => setOpenT(e.currentTarget.open)}>
            <summary>
              Add training volume <span className="predictor-optional">optional</span>
            </summary>
            <div className="predictor-more-body">
              {target.key === 'marathon' ? (
                <p className="tool-field-hint">For Tanda’s formula: your averages over the 8 weeks before the race you are predicting.</p>
              ) : <p className="tool-field-hint">Tanda’s formula predicts marathons only. Switch the prediction to a marathon to use it.</p>}
              <DistanceField id={`${uid}-wk`} label="Average weekly distance" km={wk} units={units} suffix={`${units} / week`} onChange={(km) => setQ({ wk: km === null ? '' : String(km) })} />
              <DurationField label={`Average training pace (per ${units === 'mi' ? 'mile' : 'km'})`} mode="pace" value={tp === null ? null : perUnit(tp, units)} placeholder={units === 'mi' ? '9:30' : '5:55'}
                onChange={(s) => setQ({ tp: s === null ? '' : String(Math.round(perKm(s, units) * 10) / 10) })} hint="All runs, not just easy ones." />
              {est?.tanda && 'error' in est.tanda ? <p className="tool-field-hint is-error" role="alert">{est.tanda.error}</p> : null}
              {q.wk || q.tp ? <button type="button" className="predictor-link-button" onClick={() => setQ({ wk: '', tp: '' })}>Clear training volume</button> : null}
            </div>
          </details>
        </form>

        <div className="tool-results">
          {!est ? (
            <p className="tool-empty" aria-live="polite">
              {sameAsTarget
                ? `Your recent race is already ${withArticle(target.name)}. Pick a shorter race, or predict another distance.`
                : race1Error ?? 'Enter the distance and finish time of a recent race to see the range.'}
            </p>
          ) : (
            <>
              <Headline est={est} dist={dist1} units={units} />
              {stale.length ? (
                <p className="tool-callout predictor-stale"><strong>{stale.join(' and ')} {stale.length > 1 ? 'were' : 'was'} more than 6 months ago.</strong> Every method here assumes the race reflects your fitness now; a recent race predicts better.</p>
              ) : null}

              <EvidencePanel kind="research" title="Every published method, side by side" id="predictor-methods"
                meta={est.isMarathon ? <>Each row is one published model applied to your {fmtTime(est.fromS)} {raceName(dist1, units)}. The shaded column is the typical recreational range; the dashed line is its median. Tap or hover a row for details.</> : <>Each row is one published model applied to your {fmtTime(est.fromS)} {raceName(dist1, units)}. Tap or hover a row for details.</>}>
                <MethodChart rows={rows} fuzzy={!!est.range && est.range.extrapolation === 'shorter'} label={chartLabel} />
                {est.range && est.range.extrapolation === 'shorter' ? (
                  <p className="predictor-copy predictor-fuzzy-note">
                    <i aria-hidden="true" /> Faded ends: from {withArticle(raceName(dist1, units))}, the half-marathon step is itself an estimate ({fmtTime(est.range.halfEquivalent)} by Riegel 1.06), so real outcomes spread wider than the bar. No published figure says how much wider.
                  </p>
                ) : null}
                {bandTimes.length ? (
                  <div className="predictor-bandlinks no-print">
                    <span>Make a pace band at</span>
                    <ul>
                      {bandTimes.map((s) => <li key={s}><Link href={`/tools/pace-band?goal=${formatHM(s)}`}>{formatHM(s)}</Link></li>)}
                    </ul>
                  </div>
                ) : null}
                <MethodTable est={est} units={units} dist={dist1} onAddSecond={openSecond} onAddTanda={openTanda} />
              </EvidencePanel>

              <Explainer est={est} />

              <div className="predictor-divider" role="presentation"><span>A different question</span></div>
              <ObservedPanel indexSha={indexSha} est={est} looks={looks} look={look} setLook={setLook} units={units} />

              <div className="tool-callout predictor-next no-print">
                <strong>Next steps.</strong>{' '}
                {medianGoal !== null ? <>Print a <Link href={`/tools/pace-band?goal=${formatHM(medianGoal)}`}>pace band for {formatHM(medianGoal)}</Link>, compare courses at this pace in the <Link href="/tools/course-chooser">course chooser</Link>, or </> : null}
                check a time against Boston, New York, London and others in the <Link href="/tools/qualifying">qualifying checker</Link>.
              </div>
              <ShareBar />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result sections                                                     */
/* ------------------------------------------------------------------ */

function Headline({ est, dist, units }: { est: Estimates; dist: Distance; units: UnitSystem }) {
  const from = `from ${withArticle(`${fmtTime(est.fromS)} ${raceName(dist, units)}`)}`;
  const pace = (s: number) => fmtPace(s / est.target.km, units);
  if (est.range) {
    const r = est.range;
    const [a, b] = rangeText(r.low, r.high);
    const gap = r.median - est.riegel;
    return (
      <div className="tool-headline predictor-headline" aria-live="polite">
        <div className="predictor-head">
          <span className="evidence-badge evidence-research">Published research</span>
          <p className="predictor-kicker">Marathon, {from}</p>
          <p className="predictor-range"><span className="sr-only">Typical recreational range: </span>{a}<span className="predictor-to"> to </span>{b}</p>
          <p className="predictor-range-sub">
            The typical recreational range: the half-to-full exponents ({REALISTIC_B.low} to {REALISTIC_B.high}) that runners’ own training logs show.
            {r.extrapolation === 'shorter' ? ` From ${withArticle(raceName(dist, units))} it is less certain, because the half-marathon step is itself an estimate.` : ''}
          </p>
        </div>
        <Stat label="Median estimate" value={formatDuration(r.median, true)} sub={`exponent ${REALISTIC_B.median} · ${pace(r.median)}`} />
        <Stat label="Best case" value={formatDuration(est.riegel, true)} sub={`if fully marathon-trained · Riegel ${RIEGEL_B.toFixed(2)} · ${pace(est.riegel)}`} />
        <Stat label="Classic formula gap" value={gap >= 0 ? formatDuration(gap) : `−${formatDuration(-gap)}`} sub="Riegel’s answer vs the median estimate. Measured on recreational runners: a median 10:09 too fast." />
      </div>
    );
  }
  const lo = Math.min(est.riegel, est.daniels);
  const hi = Math.max(est.riegel, est.daniels);
  const [a, b] = rangeText(lo, hi);
  return (
    <div className="tool-headline predictor-headline" aria-live="polite">
      <div className="predictor-head">
        <span className="evidence-badge evidence-research">Published research</span>
        <p className="predictor-kicker">{est.target.label === 'Half' ? 'Half marathon' : est.target.label}, {from}</p>
        <p className="predictor-range">{a === b ? a : <>{a}<span className="predictor-to"> to </span>{b}</>}</p>
        <p className="predictor-range-sub">Riegel 1.06 and the Daniels–Gilbert equations. For races up to the half marathon they are well calibrated (Vickers & Vertosick 2016), assuming you train for this distance.</p>
      </div>
      <Stat label={`Riegel ${RIEGEL_B.toFixed(2)}`} value={fmtTime(est.riegel)} sub={pace(est.riegel)} />
      <Stat label="Daniels–Gilbert" value={fmtTime(est.daniels)} sub={`the basis of VDOT · ${pace(est.daniels)}`} />
    </div>
  );
}

function MethodTable({ est, units, dist, onAddSecond, onAddTanda }: { est: Estimates; units: UnitSystem; dist: Distance; onAddSecond: () => void; onAddTanda: () => void }) {
  const pace = (s: number) => fmtPace(s / est.target.km, units);
  const targetLabel = est.target.key === 'half' ? 'Half' : est.target.label;
  const longRiegel = est.riegel > 230 * 60;
  type Row = { key: string; name: ReactNode; source: ReactNode; time: ReactNode; pace: ReactNode; note: ReactNode; cls?: string };
  const rows: Row[] = [
    {
      key: 'riegel', name: <>Riegel, b = {RIEGEL_B.toFixed(2)}</>, source: est.isMarathon ? 'Best case if fully marathon-trained · Riegel 1981' : 'Riegel 1981',
      time: fmtTime(est.riegel), pace: pace(est.riegel),
      note: est.isMarathon
        ? <>Well calibrated up to the half, but for the marathon a median <b>10:09 too fast</b> and at least 10 min too fast for half of 2,303 recreational runners (Vickers & Vertosick 2016).{longRiegel ? ' Riegel fitted efforts of about 3.5 to 230 minutes; this answer is longer.' : ''}</>
        : <>Well calibrated for races up to the half marathon in 2,303 recreational runners (Vickers & Vertosick 2016).</>,
    },
    {
      key: 'daniels', name: 'Daniels–Gilbert equations', source: 'The basis of VDOT · Daniels & Gilbert 1979',
      time: fmtTime(est.daniels), pace: pace(est.daniels),
      note: est.isMarathon
        ? <>Equal-score race from oxygen cost and sustainable fraction. Implies an exponent of {est.danielsB.toFixed(3)} here, so it is about as optimistic as Riegel for the marathon.</>
        : <>Equal-score race from oxygen cost and sustainable fraction; implies an exponent of {est.danielsB.toFixed(3)} here.</>,
    },
  ];
  if (est.range) {
    const r = est.range;
    const fromHalf = r.extrapolation === 'shorter' ? ` applied to a ${fmtTime(r.halfEquivalent)} half equivalent (Riegel 1.06)` : '';
    rows.push(
      { key: 'low', name: <>Exponent {REALISTIC_B.low}</>, source: 'Most common half-to-full · RunningAHEAD logs', time: fmtTime(r.low), pace: pace(r.low),
        note: <>The most common exponent in 4,402 runners’ logs with a half and a full within a year{fromHalf}.</> },
      { key: 'median', cls: 'is-key', name: <>Exponent {REALISTIC_B.median}</>, source: 'Median half-to-full · RunningAHEAD logs', time: fmtTime(r.median), pace: pace(r.median),
        note: <>The median: half of those runners had a larger exponent, slowing more from the half to the full.</> },
      { key: 'high', name: <>Exponent {REALISTIC_B.high}</>, source: 'Mean half-to-full · RunningAHEAD logs', time: fmtTime(r.high), pace: pace(r.high),
        note: <>The mean. Individual exponents varied widely (SD 0.084), so many runners fell well outside 1.09 to 1.15.</> },
    );
  }
  const p = est.personal;
  if (p && 'b' in p) {
    rows.push({
      key: 'personal', name: <>Your two races, b = {p.b.toFixed(3)}</>, source: 'Personal exponent from two races',
      time: p.seconds !== null ? fmtTime(p.seconds) : '—', pace: p.seconds !== null ? pace(p.seconds) : '—',
      note: <>Applied from your {nameForKm(p.fromKm, units)}. Two points are sensitive to an off day in either race. A two-race model was the most accurate of those Vickers & Vertosick tested (about 14 min typical error), though theirs was a regression.{p.warnings.map((w) => <span key={w} className="predictor-warn"> {w}</span>)}</>,
    });
  } else {
    rows.push({
      key: 'personal', cls: 'is-prompt', name: 'Your two races', source: 'Personal exponent', time: '—', pace: '',
      note: <>{p && 'error' in p ? <span className="predictor-warn">{p.error} </span> : null}<button type="button" className="predictor-link-button" onClick={onAddSecond}>Add a second race</button> to fit your own exponent.</>,
    });
  }
  if (est.isMarathon) {
    const t = est.tanda;
    if (t && 'inRange' in t) {
      rows.push({
        key: 'tanda', name: 'Tanda (2011)', source: `${fmtKm(t.k, units)}/week at ${fmtPace(t.p, units)}`,
        time: t.seconds !== null ? fmtTime(t.seconds) : '—', pace: t.seconds !== null ? pace(t.seconds) : '—',
        note: t.inRange
          ? <>From training volume and pace. Built on 22 runners and 46 marathons of 2:47 to 3:36; standard error about 4 min.</>
          : <span className="predictor-warn">Outside the range this formula was built on (2:47 to 3:36), so no number is shown.</span>,
      });
    } else {
      rows.push({
        key: 'tanda', cls: 'is-prompt', name: 'Tanda (2011)', source: 'Training volume and pace', time: '—', pace: '',
        note: <>{t && 'error' in t ? <span className="predictor-warn">{t.error} </span> : null}<button type="button" className="predictor-link-button" onClick={onAddTanda}>Add training volume</button> for a training-based estimate (finishes of 2:47 to 3:36 only).</>,
      });
    }
  }
  return (
    <div className="tool-table-wrap predictor-table-wrap">
      <table className="tool-table predictor-table">
        <thead><tr><th scope="col">Method</th><th scope="col">{targetLabel}</th><th scope="col">Known error or limit</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.cls}>
              <th scope="row" className="predictor-m-name"><span>{r.name}</span><small>{r.source}</small></th>
              <td className="predictor-m-time">{r.time}{r.pace ? <small>{r.pace}</small> : null}</td>
              <td className="predictor-m-note">{r.note}</td>
            </tr>
          ))}
        </tbody>
        <caption>Published research, applied to your {raceName(dist, units)}. Each model assumes training for the target distance, a flat course and cool weather; none adjusts for course or weather.</caption>
      </table>
    </div>
  );
}

function Explainer({ est }: { est: Estimates }) {
  if (!est.isMarathon) {
    return (
      <EvidencePanel kind="research" title="Why these two agree">
        <p className="predictor-copy">Up to the half marathon, endurance carries over between distances well enough that the classic formulas hold: in 2,303 recreational runners, Riegel was well calibrated for races up to the half (Vickers & Vertosick 2016). The marathon is where they break down. Switch the prediction to a marathon to see how far.</p>
      </EvidencePanel>
    );
  }
  return (
    <EvidencePanel kind="research" title="Why marathon predictions run fast">
      <ol className="predictor-reasons">
        <li><b>The classic formulas assume your endurance carries over.</b> Riegel’s 1.06, fitted to records, and the Daniels–Gilbert equations both describe runners trained for the distance.</li>
        <li><b>On recreational runners they miss by about ten minutes.</b> Of 2,303 surveyed runners, Riegel was well calibrated up to the half, but its marathon times were a median 10:09 too fast, and about three in four runners were slower than predicted (Vickers & Vertosick 2016).</li>
        <li><b>Runners’ own logs show a bigger exponent.</b> In 4,402 training logs with a half and a full within a year, the half-to-full exponent was 1.09 most often, 1.13 at the median and 1.15 on average: the range above.</li>
        <li><b>Training volume matters, but is not modelled here.</b> Adding weekly mileage cut the same study’s typical error from about 19.5 to about 15 minutes; its coefficients are not reproduced here.</li>
        <li><b>Neither is the course or the day.</b> A review of 114 marathon equations found no single best one, and most ignore gradient, sex and weather (Keogh et al. 2019).</li>
      </ol>
      <p className="tool-note">Pace Notes holds marathons only, so its data cannot test a half-to-full prediction. The panel below answers a different question.</p>
    </EvidencePanel>
  );
}
