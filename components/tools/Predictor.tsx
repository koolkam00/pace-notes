'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { EvidenceTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DataState, DurationField, EvidencePanel, ExampleNote, ShareBar, Stat } from '@/components/tools/ui';
import { MarathonHandoffs } from '@/components/tools/Handoffs';
import KeypadHint from '@/components/KeypadHint';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight } from '@/lib/insights';
import { loadShard, shareUnder, type ProjectorIndex, type ProjectorShard } from '@/lib/tools/data';
import { HALF_KM, MARATHON_KM, perKm, perUnit, unitKm } from '@/lib/tools/pace';
import { TANDA_RANGE_S, marathonRange, personalExponent, riegel, tandaPace, timeForVdot, vdot, type MarathonRange } from '@/lib/tools/predictor';
import { formatDuration, formatHM, parseDuration } from '@/lib/tools/time';
import { keypadInput } from '@/lib/keypad';
import { count } from '@/lib/viz/format';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';
import { RangeBracket, bracketLayout } from './RangeBracket';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const INDEX_PATH = 'tools/projector.json';
const SHARD_PATH = 'tools/projector/all/20.json';
/** Plausible race paces (s/km): 2:30 to 25:00 per km. Also used to read "22:30" as minutes for a 5K and "1:55" as hours for a half. */
const PACE_MIN = 150;
const PACE_MAX = 1500;
/** Slower than 10:00/km (6 km/h, about walking speed) the Daniels–Gilbert running equations are not applied. */
const DANIELS_PACE_MAX = 600;
const TANDA_SE_S = 240;
/** A custom distance within 0.5% of a preset (13.1 mi, 6.2 mi, 3.1 mi) is treated as that preset. */
const SNAP = 0.005;
/** Limits for the training-volume inputs, in the visitor's units (weekly distance; pace in seconds per unit). */
const TANDA_LIMITS: Record<UnitSystem, { wk: [number, number]; tp: [number, number] }> = {
  km: { wk: [8, 300], tp: [180, 900] },
  mi: { wk: [5, 185], tp: [300, 1440] },
};

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
/** Links to other tools. The pace band takes a goal from 1:30 to 8:00 and the course chooser from 2:30 to 6:30 (whole minutes). */
const BAND_MIN_S = 90 * 60;
const BAND_MAX_S = 480 * 60;
const CHOOSER_MIN_S = 150 * 60;
const CHOOSER_MAX_S = 390 * 60;
/** The goal another tool is given for an estimate: the whole minute at or below it, so every tool reads 4:11:41 as 4:11. */
const goalMinute = (s: number) => Math.floor(Math.round(s) / 60) * 60;
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

/** A pace for an error message: "54:55/mi", or "1 h 36 min per mile" when it runs past an hour (never "4:01:21/mi"). */
function paceWords(secondsPerKm: number, units: UnitSystem): string {
  const per = perUnit(secondsPerKm, units);
  return per >= 3600 ? `${spoken(per)} per ${units === 'mi' ? 'mile' : 'km'}` : fmtPace(secondsPerKm, units);
}

/**
 * Read a race time the way runners type it for this distance: "22:30" is minutes for a 5K, "1:55" is hours for a half.
 * Two-group times are ambiguous, and so is the keypad's "25:50:12"; the reading that gives a plausible pace wins. When neither does, the reading nearer
 * the plausible paces wins, so "12:00" for a 5K is read as 12 minutes (too fast) rather than 12 hours. Zero is unreadable.
 */
export function parseRaceTime(text: string, km: number | null): number | null {
  const long = parseDuration(text, 'race');
  const short = parseDuration(text, 'pace');
  const plausible = (s: number) => km !== null && s / km >= PACE_MIN && s / km <= PACE_MAX;
  let read: number | null;
  if (long === null || short === null || long === short || km === null) read = long ?? short;
  else {
    const off = (s: number) => (s / km < PACE_MIN ? Math.log(PACE_MIN / (s / km)) : Math.log(s / km / PACE_MAX));
    read = plausible(long) ? long : plausible(short) ? short : off(short) <= off(long) ? short : long;
  }
  // The keypad's 25.50.12 shows 25:50:12, and a mile's 5:45 with tenths typed after it shows 5:45:3 (lib/keypad.ts): three
  // groups can be minutes, seconds and hundredths, which a short race's time is when its hours reading is not a plausible pace.
  const hundredths = /^(\d{1,3})[:.,]([0-5]\d)[:.,](\d{1,3})$/.exec(text.trim());
  if (hundredths && !(read !== null && plausible(read))) {
    const minutes = Number(hundredths[1]) * 60 + Number(hundredths[2]) + Number(`0.${hundredths[3]}`);
    if (plausible(minutes)) read = minutes;
  }
  return read !== null && read > 0 ? read : null;
}

interface Distance {
  key: string;
  /** The distance used for every calculation: a preset's exact distance when the race is (or is within 0.5% of) one. */
  km: number | null;
  preset: Preset | null;
  /** What the "Other" field shows: the distance as typed or linked. */
  typedKm: number | null;
}

const presetFor = (km: number) => RACES.find((r) => Math.abs(r.km - km) <= r.km * SNAP) ?? null;

function resolveDistance(key: string, km: string): Distance {
  const preset = RACES.find((r) => r.key === key);
  if (preset) return { key, km: preset.km, preset, typedKm: preset.km };
  // Compatibility with numeric links such as ?d=21.0975.
  const numeric = key && key !== 'custom' ? Number(key) : NaN;
  if (Number.isFinite(numeric) && numeric > 0) {
    const match = presetFor(numeric);
    return match ? { key: match.key, km: match.km, preset: match, typedKm: match.km } : { key: 'custom', km: numeric, preset: null, typedKm: numeric };
  }
  const v = Number(km);
  const typed = km !== '' && Number.isFinite(v) && v > 0 ? v : null;
  const match = typed !== null ? presetFor(typed) : null;
  return { key: 'custom', km: match ? match.km : typed, preset: match, typedKm: typed };
}

function resolveTarget(key: string): Preset {
  const direct = TARGETS.find((t) => t.key === key);
  if (direct) return direct;
  const numeric = Number(key);
  return TARGETS.find((t) => Math.abs(t.km - numeric) < 0.01) ?? TARGETS[0];
}

const raceName = (d: Distance, units: UnitSystem) => (d.preset ? d.preset.name : d.km ? `${fmtKm(d.km, units)} race` : 'race');
const nameForKm = (km: number, units: UnitSystem) => presetFor(km)?.name ?? `${fmtKm(km, units)} race`;
const withArticle = (name: string) => (/^(8|1[18]|a|e|i|o|u)/i.test(name) ? `an ${name}` : `a ${name}`);

type RaceCheck = { ok: true; km: number; seconds: number } | { ok: false; message: string | null };

function checkRace(km: number | null, seconds: number | null, units: UnitSystem): RaceCheck {
  if (km === null) return { ok: false, message: 'Enter the race distance.' };
  const minKm = units === 'mi' ? KM_PER_MILE : 1.5;
  if (km < minKm - 0.005) return { ok: false, message: `Use a race of at least ${units === 'mi' ? '1 mile' : '1.5 km'}.` };
  if (km > MARATHON_KM + 1e-6) return { ok: false, message: 'Use a race no longer than a marathon.' };
  if (seconds === null) return { ok: false, message: null };
  const pace = seconds / km;
  if (pace < PACE_MIN) return { ok: false, message: `Read as ${spoken(seconds)}, which is ${paceWords(pace, units)}: faster than any world record. Check the time and distance.` };
  if (pace > PACE_MAX) return { ok: false, message: `Read as ${spoken(seconds)}, which is ${paceWords(pace, units)}: slower than this tool reads (${fmtPace(PACE_MAX, units)}). Check the time and distance.` };
  return { ok: true, km, seconds };
}

function niceStep(span: number, target: number, steps: number[]): number {
  for (const s of steps) if (span / s <= target) return s;
  return steps[steps.length - 1];
}

/** Axis ticks whose centred label (11px mono, about 6.7px a character) fits inside the chart. */
function fittingTicks(lo: number, hi: number, step: number, x: (s: number) => number, width: number, text: (t: number) => string): number[] {
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    const half = (text(t).length * 6.7) / 2 + 1;
    if (x(t) - half >= 0 && x(t) + half <= width) ticks.push(t);
  }
  return ticks;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

function RaceTimeField({ id, label, text, km, onText, error, hint, large = false, inputRef, onEditing }: {
  id: string; label: ReactNode; text: string; km: number | null; onText: (text: string) => void;
  error?: string | null; hint?: ReactNode; large?: boolean; inputRef?: RefObject<HTMLInputElement>;
  /** Told when the visitor starts editing (true) and leaves the field (false). */
  onEditing?: (editing: boolean) => void;
}) {
  const [touched, setTouched] = useState(false);
  // While the visitor is typing, a half-typed time ("1", "1:") is not an error yet: errors wait until they leave the field.
  const [editing, setEditing] = useState(false);
  const parsed = text.trim() ? parseRaceTime(text, km) : null;
  const invalid = !editing && touched && text.trim() !== '' && parsed === null;
  const message = editing ? null : invalid ? 'Try 1:55:00, 1:55 or 22:30.' : error;
  return (
    <div className={`tool-field${large ? ' is-large' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} ref={inputRef} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder={large ? '1:55:00' : 'h:mm:ss'} value={text}
        aria-invalid={invalid || !!message || undefined} aria-describedby={message || hint ? `${id}-hint` : undefined}
        onChange={(e) => { if (!editing) { setEditing(true); onEditing?.(true); } onText(keypadInput(e.target, e.nativeEvent)); }}
        onBlur={() => {
          setTouched(true);
          setEditing(false);
          onEditing?.(false);
          // Tidy the text only when it reads as a usable race time; an implausible reading is left as typed, next to its error.
          if (parsed !== null && km !== null && checkRace(km, parsed, 'km').ok && fmtTime(parsed) !== text) onText(fmtTime(parsed));
        }} />
      {message ? <p className="tool-field-hint is-error" id={`${id}-hint`}>{message}<KeypadHint /></p>
        : hint ? <p className="tool-field-hint" id={`${id}-hint`}>{hint}<KeypadHint /></p> : <KeypadHint block />}
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

function DistanceChips({ labelId, label, value, onPick, quiet = false }: { labelId: string; label: string; value: string; onPick: (key: string) => void; quiet?: boolean }) {
  return (
    <div className="tool-field">
      {/* Under "Your recent race" the chips say what they are, so the first race's label is for screen readers. */}
      <span className={quiet ? 'sr-only' : 'tool-label'} id={labelId}>{label}</span>
      <div className="tool-presets predictor-chips" role="group" aria-labelledby={labelId}>
        {RACES.map((r) => <button key={r.key} type="button" aria-pressed={value === r.key} onClick={() => onPick(r.key)}>{r.label}</button>)}
        <button type="button" aria-pressed={value === 'custom'} onClick={() => onPick('custom')}>Other</button>
      </div>
    </div>
  );
}

function AgoSelect({ id, label = 'When you ran it', value, onChange }: { id: string; label?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tool-field tool-select">
      <label htmlFor={id}>{label}</label>
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
/** Why Tanda gives no number: a missing input (a prompt on that field) or one outside the limits (an error on it). */
interface TandaIssue { error: string; field: 'wk' | 'tp'; missing: boolean }

interface Estimates {
  target: Preset;
  isMarathon: boolean;
  fromKm: number;
  fromS: number;
  riegel: number;
  /** Null when the race was slower than 10:00/km, where the running equations are not applied. */
  daniels: number | null;
  danielsB: number | null;
  range: MarathonRange | null;
  personal: Personal | { error: string } | null;
  tanda: Tanda | TandaIssue | null;
}

function estimate(target: Preset, race: { km: number; seconds: number }, race2: RaceCheck | null, ago: string, ago2: string, wk: number | null, tp: number | null, units: UnitSystem): Estimates {
  const isMarathon = target.key === 'marathon';
  const r = riegel(race.seconds, race.km, target.km);
  const dRaw = race.seconds / race.km <= DANIELS_PACE_MAX ? timeForVdot(vdot(race.km, race.seconds), target.km) : NaN;
  const d = Number.isFinite(dRaw) ? dRaw : null;
  let personal: Estimates['personal'] = null;
  if (race2 && race2.ok) {
    if (Math.abs(race2.km - race.km) < 0.05) personal = { error: 'Use two different distances.' };
    else {
      const b = personalExponent(race.km, race.seconds, race2.km, race2.seconds);
      const long = race.km > race2.km ? { km: race.km, s: race.seconds } : { km: race2.km, s: race2.seconds };
      const warnings: string[] = [];
      const usable = b > 0.9 && b < 1.5;
      if (!usable) warnings.push('These two races slow down between their distances far more or less than runners usually do, so they give no estimate. Check both times and distances.');
      else if (b < 1 || b > 1.3) warnings.push('These two races slow down between their distances unusually much or little. Check both times, and whether either race was hilly, hot or not run all-out.');
      // "More than 6 months ago" is open-ended, so with it either race can be more than 6 months from the other.
      if (ago === '6+' || ago2 === '6+') warnings.push('These races may be more than 6 months apart; a change in fitness between them skews the estimate.');
      personal = { b, seconds: usable ? riegel(long.s, long.km, target.km, b) : null, fromKm: long.km, fromS: long.s, warnings };
    }
  }
  let tanda: Estimates['tanda'] = null;
  if (isMarathon && (wk !== null || tp !== null)) {
    const lim = TANDA_LIMITS[units];
    const wkU = wk === null ? null : wk / unitKm(units);
    const tpU = tp === null ? null : perUnit(tp, units);
    const unitName = units === 'mi' ? 'mi' : 'km';
    if (wk === null) tanda = { error: 'Add your weekly distance too.', field: 'wk', missing: true };
    else if (tp === null) tanda = { error: 'Add your average training pace too.', field: 'tp', missing: true };
    else if (wkU! < lim.wk[0] - 0.01 || wkU! > lim.wk[1] + 0.01) tanda = { error: `Weekly distance should be between ${lim.wk[0]} and ${lim.wk[1]} ${unitName}.`, field: 'wk', missing: false };
    else if (tpU! < lim.tp[0] - 0.5 || tpU! > lim.tp[1] + 0.5) tanda = { error: `Training pace should be between ${formatDuration(lim.tp[0])} and ${formatDuration(lim.tp[1])} per ${units === 'mi' ? 'mile' : 'km'}.`, field: 'tp', missing: false };
    else {
      const seconds = tandaPace(wk, tp) * MARATHON_KM;
      const inRange = seconds >= TANDA_RANGE_S[0] && seconds <= TANDA_RANGE_S[1];
      tanda = { seconds: inRange ? seconds : null, inRange, k: wk, p: tp };
    }
  }
  return {
    target, isMarathon, fromKm: race.km, fromS: race.seconds, riegel: r, daniels: d,
    danielsB: d === null ? null : Math.log(d / race.seconds) / Math.log(target.km / race.km),
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
  // Each row: its name (and value at the right) on one line, the detail under it on a phone, then the mark. On a very
  // narrow screen (a phone at 200% text) a long name or detail wraps and the value moves under the name.
  const inner = width - m.l - m.r;
  const wrap = (text: string, charW: number) => {
    const max = Math.max(8, Math.floor(inner / charW));
    const out: string[] = [];
    for (const word of text.split(' ')) {
      const last = out[out.length - 1];
      if (last !== undefined && (last + ' ' + word).length <= max) out[out.length - 1] = `${last} ${word}`; else out.push(word);
    }
    return out;
  };
  const layout = rows.map((r) => {
    if (!narrow) return { label: [r.label], valueOwn: false, detail: [] as string[], h: 48, mark: 35 };
    const label = wrap(r.label, 8.2);
    const valueOwn = label.length > 1 || (label[0].length + r.value.length + 2) * 8.2 > inner;
    const detail = r.detail ? wrap(r.detail, 6.6) : [];
    const lines = label.length * 17 + (valueOwn ? 17 : 0) + detail.length * 15;
    const h = Math.max(62, lines + 30);
    return { label, valueOwn, detail, h, mark: h - 16 };
  });
  const tops: number[] = [];
  layout.reduce((y, l) => { tops.push(y); return y + l.h; }, m.t);
  const plotBottom = m.t + layout.reduce((sum, l) => sum + l.h, 0);
  const H = plotBottom + m.b;
  const x = (s: number) => m.l + ((s - lo) / (hi - lo)) * (width - m.l - m.r);
  const step = niceStep(hi - lo, narrow ? 4 : 7, [15, 30, 60, 120, 300, 600, 900, 1800, 3600]);
  const tickText = (t: number) => (t >= 3600 ? formatHM(t) : formatDuration(t));
  const ticks = fittingTicks(lo, hi, step, x, width, tickText);
  const bandIndex = rows.findIndex((r) => r.kind === 'range');
  const band = bandIndex >= 0 ? rows[bandIndex] : undefined;
  const rowAt = (clientY: number, svg: SVGSVGElement) => {
    const y = clientY - svg.getBoundingClientRect().top;
    const i = tops.findIndex((top, k) => y >= top && y < top + layout[k].h);
    return i >= 0 ? rows[i].key : null;
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
        {activeRow ? <rect x={0} y={tops[activeIndex] + 1} width={width} height={layout[activeIndex].h - 2} rx={10} className="predictor-row-active" /> : null}
        {/* The range's wash stays on its own row, so the values right-aligned on the other rows never sit inside it. */}
        {band && band.lo !== undefined && band.hi !== undefined ? (
          <g aria-hidden="true">
            <rect x={x(band.lo)} y={tops[bandIndex] + 1} width={Math.max(1, x(band.hi) - x(band.lo))} height={layout[bandIndex].h - 2} rx={8} className="predictor-band" />
          </g>
        ) : null}
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={x(t)} x2={x(t)} y1={m.t} y2={plotBottom} />
            <text x={x(t)} y={plotBottom + 18} textAnchor="middle">{tickText(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const top = tops[i];
          const lay = layout[i];
          const labelY = top + 16;
          const valueY = labelY + lay.label.length * 17;
          const detailY = valueY + (lay.valueOwn ? 17 : 0) - 2;
          const markY = top + lay.mark;
          return (
            <g key={r.key} className={`predictor-row is-${r.tone}${r.kind === 'none' ? ' is-none' : ''}`}>
              {narrow ? lay.label.map((line, k) => <text key={k} x={m.l} y={labelY + k * 17} className="predictor-row-label">{line}</text>) : (
                <text x={m.l} y={labelY} className="predictor-row-label">
                  {r.label}{r.detail ? <tspan className="predictor-row-detail">{`  ${r.detail}`}</tspan> : null}
                </text>
              )}
              {lay.detail.map((line, k) => <text key={k} x={m.l} y={detailY + k * 15} className="predictor-row-detail">{line}</text>)}
              {lay.valueOwn
                ? <text x={m.l} y={valueY} className="predictor-row-value">{r.value}</text>
                : <text x={width - m.r} y={labelY} textAnchor="end" className="predictor-row-value">{r.value}</text>}
              <line x1={m.l} x2={width - m.r} y1={markY} y2={markY} className="predictor-track" />
              {r.kind === 'range' && r.lo !== undefined && r.hi !== undefined && r.mid !== undefined ? (
                <g>
                  {fuzzy ? <>
                    <rect x={x(r.lo) - 22} y={markY - 6} width={22} height={12} rx={6} className="predictor-span is-fuzzy" />
                    <rect x={x(r.hi)} y={markY - 6} width={22} height={12} rx={6} className="predictor-span is-fuzzy" />
                  </> : null}
                  <rect x={x(r.lo)} y={markY - 6} width={Math.max(4, x(r.hi) - x(r.lo))} height={12} rx={6} className="predictor-span" />
                  <line x1={x(r.mid)} x2={x(r.mid)} y1={markY - 11} y2={markY + 11} className="predictor-span-mid" />
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
                    ? <circle cx={x(r.at)} cy={markY} r={6} className="predictor-dot is-hollow" />
                    : <circle cx={x(r.at)} cy={markY} r={6.5} className="predictor-dot" />}
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      {activeRow ? (
        <div className="viz-tooltip predictor-tip" aria-hidden="true" style={{ left: Math.min(width - 96, Math.max(96, x(anchor))), top: tops[activeIndex] + layout[activeIndex].mark - 10 }}>
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
  const [attempt, setAttempt] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!sha || !enabled || started.current) return;
    started.current = true;
    setState({ index: null, shard: null, error: null });
    loadInsight<ProjectorIndex>(INDEX_PATH, sha)
      .then((index) => loadShard<ProjectorShard>(index, SHARD_PATH).then((shard) => ({ index, shard })))
      .then(
        ({ index, shard }) => setState({ index, shard, error: null }),
        (e: unknown) => {
          started.current = false;
          const reason = e instanceof Error && e.message ? e.message.trim() : 'This data could not be loaded.';
          setState({ index: null, shard: null, error: `${/[.!?]$/.test(reason) ? reason : `${reason}.`} The published estimates above are unaffected.` });
        },
      );
  }, [sha, enabled, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

interface Marker { key: string; x: number; label: string; tone: 'est' | 'median' }

/**
 * Each label is a flag beside its line: the leftmost marker's to the left, the others' to the right, flipped when the
 * chart's edge is in the way, and dropped a row when two would touch.
 */
function stackLabels(markers: Marker[], width: number, margin: number) {
  const charW = 6.9;
  const rows: number[] = [];
  return [...markers].sort((a, b) => a.x - b.x).map((mk, i) => {
    const w = mk.label.length * charW;
    const left = mk.x - 6 - w;
    const right = mk.x + 6;
    const wantLeft = i === 0 && markers.length > 1;
    const x0 = wantLeft ? (left >= margin ? left : right) : (right + w <= width - margin ? right : Math.max(margin, left));
    let row = rows.findIndex((end) => end + 12 < x0);
    if (row < 0) { row = rows.length; rows.push(x0 + w); } else rows[row] = x0 + w;
    return { ...mk, x0, row, w };
  });
}

function FinishStrip({ q, Q, est }: { q: number[]; Q: number[]; est: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const i10 = qIndex(Q, 0.1); const i50 = qIndex(Q, 0.5); const i90 = qIndex(Q, 0.9);
  const lo0 = Math.min(q[0], est);
  const hi0 = Math.max(q[q.length - 1], est);
  const pad = Math.max(hi0 - lo0, 900) * 0.06;
  const [lo, hi] = [lo0 - pad, hi0 + pad];
  const m = { l: 8, r: 8 };
  const x = (s: number) => m.l + ((s - lo) / (hi - lo)) * (width - m.l - m.r);
  const fmt = narrow ? fmtShort : fmtTime;
  const tiny = width < 300;
  const markers = stackLabels([
    // The marker is the whole minute the cohort is on pace for ("On 4:11 pace"), never the estimate's own label: the
    // card above gives the estimate to the second.
    { key: 'est', x: x(est), label: tiny ? fmtShort(est) : `On ${fmtShort(est)} pace`, tone: 'est' as const },
    { key: 'median', x: x(q[i50]), label: `Their median ${fmt(q[i50])}`, tone: 'median' as const },
  ], width, m.l);
  const labelRows = Math.max(1, ...markers.map((mk) => mk.row + 1));
  const top = 8 + labelRows * 17;
  const plotH = narrow ? 80 : 96;
  const base = top + plotH;
  const range = `${fmtShort(q[i10])}–${fmtShort(q[i90])}`;
  const bracket = bracketLayout(x(q[i10]), x(q[i90]), `80% of finishes: ${range}`, width, m.l, `80%: ${range}`);
  const bracketY = base + 34;
  const H = bracketY + bracket.height;
  const dens = q.slice(0, -1).map((v, i) => 0.05 / Math.max(1, q[i + 1] - v));
  const maxD = Math.max(...dens);
  const step = niceStep(hi - lo, narrow ? 4 : 7, [60, 120, 300, 600, 900, 1800, 3600]);
  const ticks = fittingTicks(lo, hi, step, x, width, fmtShort);
  const label = `Finish times of these finishes, in 5% slices: 10th percentile ${fmtTime(q[i10])}, median ${fmtTime(q[i50])}, 90th percentile ${fmtTime(q[i90])}. ${fmtShort(est)} pace is marked.`;
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
          return <rect key={i} x={x(q[i])} width={Math.max(0.5, x(q[i + 1]) - x(q[i]))} y={base - h} height={h} className="predictor-strip-bar" />;
        })}
        <line x1={m.l} x2={width - m.r} y1={base} y2={base} className="predictor-strip-base" />
        <RangeBracket b={bracket} y={bracketY} />
        {markers.map((mk) => (
          <line key={mk.key} x1={mk.x} x2={mk.x} y1={14 + mk.row * 17 - 11} y2={base} className={`predictor-marker-line is-${mk.tone}`} />
        ))}
        {markers.map((mk) => (
          <g key={mk.key}>
            <rect x={mk.x0 - 3} y={14 + mk.row * 17 - 12} width={mk.w + 6} height={16} className="predictor-marker-halo" />
            <text x={mk.x0} y={14 + mk.row * 17} className={`predictor-marker is-${mk.tone}`}>{mk.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ObservedPanel({ indexSha, est, looks, look, setLook, units }: {
  indexSha: string | null; est: Estimates; looks: Look[]; look: LookKey; setLook: (k: LookKey) => void; units: UnitSystem;
}) {
  const { index, shard, error, retry } = useProjector(indexSha, est.isMarathon);
  const lookRef = useRef<HTMLDivElement>(null);
  if (!est.isMarathon || !indexSha) return null;
  const chosen = looks.find((l) => l.key === look) ?? looks[0];
  // The whole minute at or below the estimate, the way the handoffs above hand it on (4:11:41 is 4:11), so the page
  // names one time for it, not 4:11 here and 4:12 there.
  const T = goalMinute(chosen.seconds);
  const bandS = index?.band_s ?? 120;
  const band = Math.floor(T / bandS) * bandS;
  const cells = shard?.cells.all;
  const i = cells ? cells.b.indexOf(band) : -1;
  const Q = index?.quantiles ?? [];
  const i50 = qIndex(Q, 0.5);
  const lookChoice = (
    <div className="tool-field predictor-look no-print" ref={lookRef}>
      <span className="tool-label" id="predictor-look-label">On even pace at 20K for</span>
      <div className="seg tool-choice is-small" role="group" aria-labelledby="predictor-look-label">
        {looks.map((l) => <button key={l.key} type="button" className="seg-btn" aria-pressed={l.key === chosen.key} onClick={() => setLook(l.key)}>{l.chip}</button>)}
      </div>
    </div>
  );
  const bandRange = `${fmtShort(band)}–${fmtShort(band + bandS)}`;
  const scope = index?.scopes.find((s) => s.slug === 'all');
  const bands = scope?.mats['20']?.bands ?? null;
  return (
    <section className="tool-panel predictor-data" id="predictor-data" aria-labelledby="predictor-data-title">
      <EvidenceTag kind="data" />
      <DataState error={error} loading={!error && (!index || !shard)}>
        {cells && i >= 0 ? (() => {
          const q = cells.q[i];
          const share = shareUnder(T, q, Q);
          const sd = cells.sd[i][0] + cells.sd[i][1];
          const shareText = share.bound === 'below' ? '5% or fewer' : share.bound === 'above' ? 'more than 95%' : pctText(share.share);
          return (
            <>
              <p className="tool-nugget-text" id="predictor-data-title">
                Finishes on {fmtShort(T)} pace at 20K finished in a median <em>{formatDuration(q[i50], true)}</em>.
              </p>
              <FinishStrip q={q} Q={Q} est={T} />
              <dl className="tool-cells">
                <div><dt>Finished under {fmtShort(T)}</dt><dd>{shareText}</dd></div>
                <div><dt><SlowdownTerm>Sustained slowdown</SlowdownTerm></dt><dd>{pctText(sd)}</dd></div>
              </dl>
              {lookChoice}
            </>
          );
        })() : (
          <>
            <p className="tool-state" id="predictor-data-title">
              Too few finishes passed 20 km on {bandRange} even pace to show.
              {bands ? ` Groups at 20 km cover even paces from about ${fmtShort(bands[0])} to ${fmtShort(bands[1] + bandS)}.` : ''}
            </p>
            {lookChoice}
          </>
        )}
      </DataState>
      {error ? (
        <button type="button" className="btn btn-secondary is-compact predictor-retry" onClick={() => {
          // The button goes away while the data reloads, so focus moves to the estimate buttons above it first.
          lookRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
          retry();
        }}>Try again</button>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The tool                                                            */
/* ------------------------------------------------------------------ */

export default function Predictor({ indexSha }: { indexSha: string | null }) {
  const { units } = useUnits();
  const [q, setQuery, ready, fromUrl] = useQueryState<Query>(DEFAULTS);
  // The example note shows while every input is the untouched example; any change, or a link with values, hides it.
  const [edited, setEdited] = useState(false);
  const setQ = useCallback((patch: Partial<Query>) => { setEdited(true); setQuery(patch); }, [setQuery]);
  const isExample = !edited && fromUrl.size === 0;
  const [converted, setConverted] = useState<string | null>(null);
  const [open2, setOpen2] = useState(false);
  const [openT, setOpenT] = useState(false);
  const [look, setLook] = useState<LookKey>('median');
  const [typing, setTyping] = useState(false);
  const lastGood = useRef<{ km: number; seconds: number } | null>(null);
  const race2Ref = useRef<HTMLInputElement>(null);
  const second = useRef<HTMLElement>(null);
  const tandaRef = useRef<HTMLDetailsElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!ready) return;
    if (q.t2 || q.ago) setOpen2(true);
    if (q.wk || q.tp) setOpenT(true);
    // Open the disclosures that a shared link fills, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const target = resolveTarget(q.to);
  const dist1 = resolveDistance(q.d, q.km);
  const t1 = parseRaceTime(q.t, dist1.km);
  const race1 = checkRace(dist1.km, t1, units);
  const sameAsTarget = race1.ok && Math.abs(race1.km - target.km) < 0.05;
  useEffect(() => { if (race1.ok) lastGood.current = { km: race1.km, seconds: race1.seconds }; });
  // While the finish time is being typed, a half-typed value ("1", "1:") keeps the last result on screen, dimmed,
  // instead of flashing an error; the error appears if the field is left that way.
  const held = !race1.ok && typing && lastGood.current && dist1.km !== null && Math.abs(lastGood.current.km - dist1.km) < 1e-9 ? lastGood.current : null;
  const shown = race1.ok ? race1 : held;

  const d2Default = dist1.preset?.key === 'half' ? '10k' : 'half';
  const dist2 = resolveDistance(q.d2 || d2Default, q.km2);
  const t2 = q.t2.trim() ? parseRaceTime(q.t2, dist2.km) : null;
  const race2 = q.t2.trim() ? checkRace(dist2.km, t2, units) : null;

  const wk = q.wk && Number(q.wk) > 0 ? Number(q.wk) : null;
  const tp = q.tp && Number(q.tp) > 0 ? Number(q.tp) : null;

  const est = shown && !sameAsTarget ? estimate(target, shown, race2, q.ago, q.ago2, wk, tp, units) : null;

  const pickDistance = (key: string) => {
    if (key === dist1.key) return;
    const nextKm = key === 'custom' ? (dist1.km ?? 15) : RACES.find((r) => r.key === key)!.km;
    const patch: Partial<Query> = { d: key, km: key === 'custom' ? String(Math.round(nextKm * 1000) / 1000) : '' };
    if (race1.ok && key !== 'custom' && Math.abs(nextKm - race1.km) > 1e-9) {
      // Keep the result meaningful while the visitor types their own time: Riegel-equivalent at the new distance.
      const next = Math.round(riegel(race1.seconds, race1.km, nextKm));
      patch.t = fmtTime(next);
      setConverted(`Filled in from your ${fmtTime(race1.seconds)} ${raceName(dist1, units)} by the classic formula. Type your own ${RACES.find((r) => r.key === key)!.name} time.`);
    }
    setQ(patch);
  };

  const pace1 = race1.ok ? race1.seconds / race1.km : null;
  const timeHint = converted ?? (race1.ok && t1 !== null ? `Read as ${spoken(t1)} · ${fmtPace(pace1!, units)}.` : 'h:mm:ss, or mm:ss for short races.');
  const race1Error = !race1.ok ? race1.message : null;
  const snapHint = (d: Distance) => (d.key === 'custom' && d.preset ? `Treated as ${withArticle(d.preset.name)} (${fmtKm(d.preset.km, units)}).` : undefined);

  // Rows for the chart and the method table.
  const rows: ChartRow[] = [];
  const looks: Look[] = [];
  if (est) {
    const pace = (s: number) => fmtPace(s / est.target.km, units);
    // Plain names for each estimate; which published formula is which lives on /methodology#tools-predictor.
    rows.push({
      key: 'riegel', label: 'Classic formula', detail: '',
      value: fmtTime(est.riegel), kind: 'point', at: est.riegel, tone: 'ink',
      tip: [`${fmtTime(est.riegel)} · ${pace(est.riegel)}`, est.isMarathon ? 'A median 10:09 too fast for recreational runners.' : 'Holds up well for races up to the half.'],
    });
    rows.push(est.daniels !== null ? {
      key: 'daniels', label: 'Fitness equations', detail: '',
      value: fmtTime(est.daniels), kind: 'point', at: est.daniels, tone: 'ink',
      tip: [`${fmtTime(est.daniels)} · ${pace(est.daniels)}`, est.isMarathon ? 'About as optimistic as the classic formula.' : 'Close to the classic formula up to the half.'],
    } : {
      key: 'daniels', label: 'Fitness equations', detail: 'not applied at walking speed', value: 'not applied', kind: 'none', tone: 'ink',
      tip: [`Your race averaged ${fmtPace(est.fromS / est.fromKm, units)}, slower than ${fmtPace(DANIELS_PACE_MAX, units)}, so no number is shown.`],
    });
    if (est.range) {
      const r = est.range;
      rows.push({
        // The card above gives the range; its row names the median, the tick on the bar.
        key: 'range', label: 'The typical range', detail: 'recreational runners',
        value: `median ${fmtTime(r.median)}`, kind: 'range', lo: r.low, mid: r.median, hi: r.high, tone: 'violet',
        tip: [`${fmtTime(r.low)} to ${fmtTime(r.high)}`, `Median estimate ${fmtTime(r.median)} · ${pace(r.median)}`],
      });
      looks.push(
        { key: 'median', label: 'Median estimate', chip: 'Median', seconds: r.median },
        { key: 'riegel', label: 'Classic formula', chip: 'Classic', seconds: est.riegel },
        { key: 'low', label: 'Range start', chip: 'Range start', seconds: r.low },
        { key: 'high', label: 'Range end', chip: 'Range end', seconds: r.high },
      );
    }
    if (est.personal && 'b' in est.personal) {
      const p = est.personal;
      rows.push({
        key: 'personal', label: 'Your two races', detail: '',
        value: p.seconds !== null ? fmtTime(p.seconds) : 'not applied', kind: p.seconds !== null ? 'point' : 'none', at: p.seconds ?? undefined, tone: 'outline',
        tip: p.seconds !== null ? [`${fmtTime(p.seconds)} · ${pace(p.seconds)}`, `Your own slowdown between the two distances, applied from your ${nameForKm(p.fromKm, units)}.`] : ['These two races are too far apart in form to apply.'],
      });
    }
    if (est.tanda && 'inRange' in est.tanda) {
      const t = est.tanda;
      rows.push({
        key: 'tanda', label: 'From training volume', detail: t.inRange ? '±4 min' : '2:47–3:36 finishes only',
        value: t.seconds !== null ? fmtTime(t.seconds) : 'outside its range', kind: t.seconds !== null ? 'point' : 'none', at: t.seconds ?? undefined,
        whisker: t.seconds !== null ? TANDA_SE_S : undefined, tone: 'outline',
        tip: t.seconds !== null ? [`${fmtTime(t.seconds)} · ${pace(t.seconds)}`, 'Typically within about 4 minutes.'] : ['Outside the 2:47–3:36 this formula covers, so no number is shown.'],
      });
    }
  }
  const chartLabel = est ? `Predicted ${est.target.name} times, estimate by estimate. ${rows.map((r) => `${r.label}: ${r.kind === 'range' ? `${fmtTime(r.lo!)} to ${fmtTime(r.hi!)}, median ${fmtTime(r.mid!)}` : r.value}`).join('. ')}.` : '';

  // Pace-band goals: the whole minute at or below each estimate, inside the band's 1:30 to 8:00.
  const bandTimes = est?.range
    ? [...new Set([est.riegel, est.range.low, est.range.median, est.range.high].map(goalMinute))].filter((s) => s >= BAND_MIN_S && s <= BAND_MAX_S).sort((a, b) => a - b)
    : [];

  const medianMinute = est?.range ? goalMinute(est.range.median) : null;
  const medianGoal = medianMinute !== null && bandTimes.includes(medianMinute) ? medianMinute : null;
  const chooserGoal = medianMinute !== null && medianMinute >= CHOOSER_MIN_S && medianMinute <= CHOOSER_MAX_S ? medianMinute : null;


  const stale = [q.ago === '6+' ? 'Your recent race' : null, race2?.ok && q.ago2 === '6+' ? 'Your second race' : null].filter(Boolean) as string[];

  const tandaIssue = est?.tanda && 'error' in est.tanda ? est.tanda : null;
  const emptyText = sameAsTarget
    ? `Your recent race is already ${withArticle(target.name)}. Pick a shorter race, or predict another distance.`
    : (typing ? null : race1Error) ?? 'Enter the distance and finish time of a recent race to see the range.';

  // One always-present status line for screen readers: a short summary, spoken once the inputs settle.
  const summary = est ? summaryText(est) : emptyText;
  const [announce, setAnnounce] = useState('');
  const firstSummary = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return undefined;
    if (firstSummary.current === null) { firstSummary.current = summary; return undefined; }
    const id = window.setTimeout(() => setAnnounce(summary), 900);
    return () => window.clearTimeout(id);
  }, [summary, ready]);

  return (
    <div className="predictor">
      <div className="tool-workspace">
        <form className="tool-inputs predictor-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Finish-time predictor inputs">
          <h2>Your recent race</h2>
          <DistanceChips labelId={`${uid}-d1`} label="Distance" quiet value={dist1.key} onPick={pickDistance} />
          {dist1.key === 'custom' ? (
            <DistanceField id={`${uid}-km1`} label="Race distance" km={dist1.typedKm} units={units} suffix={units} hint={snapHint(dist1)}
              onChange={(km) => setQ({ d: 'custom', km: km === null ? '' : String(km) })} />
          ) : null}
          <RaceTimeField id={`${uid}-t1`} label="Finish time" large text={q.t} km={dist1.km} error={race1Error} onEditing={setTyping}
            onText={(text) => { setConverted(null); setQ({ t: text }); }} hint={timeHint} />
          <div className="tool-field predictor-target">
            <span className="tool-label" aria-hidden="true">Predict</span>
            <Choice label="Distance to predict" value={target.key} onChange={(v) => setQ({ to: v })} options={TARGETS.map((t) => ({ value: t.key, label: t.label }))} />
          </div>

          <details className="predictor-more" open={open2} onToggle={(e) => setOpen2(e.currentTarget.open)}>
            <summary ref={second}>
              Add a second race <span className="predictor-optional">optional</span>
              {race2?.ok && est?.personal && 'b' in est.personal && est.personal.seconds !== null ? <span className="predictor-summary-value">{fmtTime(est.personal.seconds)}</span> : null}
            </summary>
            <div className="predictor-more-body">
              <p className="tool-field-hint">A second race at another distance gives an estimate from your own slowdown between them.</p>
              <DistanceChips labelId={`${uid}-d2`} label="Distance" value={dist2.key} onPick={(key) => setQ({ d2: key, km2: key === 'custom' ? q.km2 || '15' : '' })} />
              {dist2.key === 'custom' ? (
                <DistanceField id={`${uid}-km2`} label="Race distance" km={dist2.typedKm} units={units} suffix={units} hint={snapHint(dist2)}
                  onChange={(km) => setQ({ d2: 'custom', km2: km === null ? '' : String(km) })} />
              ) : null}
              <RaceTimeField id={`${uid}-t2`} label="Finish time" text={q.t2} km={dist2.km} inputRef={race2Ref}
                error={race2 && !race2.ok ? race2.message : est?.personal && 'error' in est.personal ? est.personal.error : null}
                hint={race2?.ok && t2 !== null ? `Read as ${spoken(t2)} · ${fmtPace(race2.seconds / race2.km, units)}.` : undefined}
                onText={(text) => setQ({ t2: text, d2: q.d2 || dist2.key })} />
              <AgoSelect id={`${uid}-ago2`} value={q.ago2} onChange={(v) => setQ({ ago2: v })} />
              <AgoSelect id={`${uid}-ago1`} label="When you ran your recent race" value={q.ago} onChange={(v) => setQ({ ago: v })} />
              {est?.personal && 'b' in est.personal ? est.personal.warnings.map((w) => <p key={w} className="tool-field-hint is-error">{w}</p>) : null}
              {q.t2 ? (
                <button type="button" className="predictor-link-button" onClick={() => {
                  // This button goes away with the race, so focus moves to the disclosure it sits in first.
                  second.current?.focus();
                  setQ({ t2: '', d2: '', km2: '', ago2: '' });
                }}>Remove the second race</button>
              ) : null}
            </div>
          </details>

          <details ref={tandaRef} className="predictor-more" open={openT} onToggle={(e) => setOpenT(e.currentTarget.open)}>
            <summary>
              Add training volume <span className="predictor-optional">optional</span>
            </summary>
            <div className="predictor-more-body">
              {target.key === 'marathon' ? (
                <p className="tool-field-hint">Your averages over the 8 weeks before the race you are predicting.</p>
              ) : <p className="tool-field-hint">Training volume predicts marathons only. Switch the prediction to a marathon to use it.</p>}
              <DistanceField id={`${uid}-wk`} label="Average weekly distance" km={wk} units={units} suffix={`${units} / week`}
                hint={tandaIssue?.field === 'wk' && tandaIssue.missing ? tandaIssue.error : undefined}
                error={tandaIssue?.field === 'wk' && !tandaIssue.missing ? tandaIssue.error : null}
                onChange={(km) => setQ({ wk: km === null ? '' : String(km) })} />
              {/* The pace is stored per km to 0.1 s; shown in whole seconds per unit, so a typed 9:30/mi reads back as 9:30 and the text is never rewritten mid-typing. */}
              <DurationField label={`Average training pace (per ${units === 'mi' ? 'mile' : 'km'})`} mode="pace" value={tp === null ? null : Math.round(perUnit(tp, units))} placeholder={units === 'mi' ? '9:30' : '5:55'}
                onChange={(s) => setQ({ tp: s === null ? '' : String(Math.round(perKm(s, units) * 10) / 10) })}
                hint={tandaIssue?.field === 'tp' && tandaIssue.missing ? `${tandaIssue.error} All runs, not just easy ones.` : 'All runs, not just easy ones.'}
                error={tandaIssue?.field === 'tp' && !tandaIssue.missing ? tandaIssue.error : undefined} />
              {q.wk || q.tp ? (
                <button type="button" className="predictor-link-button" onClick={() => {
                  // This button goes away with the values, so focus moves to the weekly distance first.
                  tandaRef.current?.querySelector('input')?.focus();
                  setQ({ wk: '', tp: '' });
                }}>Clear training volume</button>
              ) : null}
            </div>
          </details>
        </form>

        <div className={`tool-results${held ? ' predictor-held' : ''}`} aria-busy={held ? true : undefined}>
          <p className="sr-only" role="status">{announce}</p>
          {!est ? (
            <p className="tool-empty">{emptyText}</p>
          ) : (
            <>
              {/* Every estimate's figure sits inside the research card (one source, one badge at its foot), so no unbadged
                  published-research block stands between it and the Pace Notes data panel. */}
              <Headline est={est} dist={dist1} units={units} example={isExample}>
                <div className="predictor-methods" id="predictor-methods">
                  <h3 className="predictor-methods-title">Every estimate, side by side</h3>
                  <MethodChart rows={rows} fuzzy={!!est.range && est.range.extrapolation === 'shorter'} label={chartLabel} />
                </div>
              </Headline>
              {stale.length ? (
                <p className="tool-note predictor-stale"><strong>{stale.join(' and ')} {stale.length > 1 ? 'were' : 'was'} more than 6 months ago.</strong> A recent race predicts better.</p>
              ) : null}


              <ObservedPanel indexSha={indexSha} est={est} looks={looks} look={look} setLook={setLook} units={units} />
              {/* The median estimate, handed on as the whole minute at or below it, as every tool reads it (4:11:41 is 4:11),
                  after the last section. The planner is the page's next card, so it is not a row here too. */}
              {est.range ? <MarathonHandoffs label="With this estimate" seconds={Math.round(est.range.median)} to={['band', 'pacing']} /> : null}
              <ShareBar />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The short line the status region speaks when the result changes. */
function summaryText(est: Estimates): string {
  if (est.range) {
    const r = est.range;
    return `Marathon: typical range ${fmtTime(r.low)} to ${fmtTime(r.high)}, median estimate ${fmtTime(r.median)}, classic formula ${fmtTime(est.riegel)}.`;
  }
  const name = est.target.key === 'half' ? 'Half marathon' : est.target.label;
  if (est.daniels === null) return `${name}: ${fmtTime(est.riegel)}.`;
  const [lo, hi] = [Math.min(est.riegel, est.daniels), Math.max(est.riegel, est.daniels)];
  return `${name}: ${fmtTime(lo)} to ${fmtTime(hi)}.`;
}

/* ------------------------------------------------------------------ */
/* Result sections                                                     */
/* ------------------------------------------------------------------ */

function Headline({ est, dist, units, example, children }: { est: Estimates; dist: Distance; units: UnitSystem; example: boolean; children?: ReactNode }) {
  // The kicker stays on one line at a phone's width: "From a 1:55 half" (the marathon is the tool's own target), whole
  // minutes without their ":00", the half by its short name.
  const fromTime = fmtTime(est.fromS).replace(/^(\d+:\d\d):00$/, '$1');
  const fromRace = dist.preset?.name === 'half marathon' ? 'half' : raceName(dist, units);
  const from = `from ${withArticle(`${fromTime} ${fromRace}`)}`;
  const pace = (s: number) => fmtPace(s / est.target.km, units);
  const name = est.target.key === 'marathon' ? '' : est.target.label === 'Half' ? 'Half marathon' : est.target.label;
  const said = name ? `${name} ${from}` : from.replace(/^f/, 'F');
  const head = (figure: ReactNode, line: string) => (
    <div className="tool-reading-head">
      <p className="tool-reading-kicker">{example ? 'Example · ' : ''}{said}</p>
      <h2 className="tool-reading-figure predictor-range">{figure}<small>{line}</small></h2>
    </div>
  );
  if (est.range) {
    const r = est.range;
    const [a, b] = rangeText(r.low, r.high);
    return (
      <section className="tool-reading night predictor-headline" aria-label="Your estimate">
        {head(<><span className="sr-only">Typical recreational range: </span>{a}<span className="predictor-to">–</span>{b}</>,
          `The typical recreational range${r.extrapolation === 'shorter' ? ', less certain from a shorter race' : ''}: ${pace(r.low).replace(/\/\w+$/, '')}–${pace(r.high)}.`)}
        {children}
        <EvidenceTag kind="research" />
      </section>
    );
  }
  if (est.daniels === null) {
    return (
      <section className="tool-reading night predictor-headline" aria-label="Your estimate">
        {head(fmtTime(est.riegel), 'One classic formula only: the fitness equations are not applied at walking speed.')}
        {children}
        <EvidenceTag kind="research" />
      </section>
    );
  }
  const lo = Math.min(est.riegel, est.daniels);
  const hi = Math.max(est.riegel, est.daniels);
  const [a, b] = rangeText(lo, hi);
  return (
    <section className="tool-reading night predictor-headline" aria-label="Your estimate">
      {head(a === b ? a : <>{a}<span className="predictor-to">–</span>{b}</>, 'Both classic formulas hold up well for races up to the half marathon.')}
      {children}
      <EvidenceTag kind="research" />
    </section>
  );
}
