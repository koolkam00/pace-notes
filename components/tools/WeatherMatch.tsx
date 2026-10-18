'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { EvidenceTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { ToolHandoffs } from '@/components/tools/Handoffs';
import { Choice, DurationField, ShareBar } from '@/components/tools/ui';
import Values from '@/components/ui/Values';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { fitTicks } from '@/components/tools/ticks';
import { loadInsight } from '@/lib/insights';
import { courseSlug } from '@/lib/tools/links';
import type { WeatherEdition, WeatherMatch as WeatherMatchData, WeatherRow } from '@/lib/tools/data';
import { MARATHON_KM, perKm, perUnit } from '@/lib/tools/pace';
import { formatClock, formatDuration, formatHM, parseClock, parseDuration } from '@/lib/tools/time';
import { WEATHER_EXAMPLE, WEATHER_REFERENCE, acsmFlag, cToF, dewPointBand, ely, fToC, hadley, mantzios, relativeHumidity, wetBulb, type Flag, type PercentRange } from '@/lib/tools/weather';
import { SECTION_BOUNDS, checkpointLabel, count, mss } from '@/lib/viz/format';
import { sectionLabel as sectionName, type UnitSystem } from '@/lib/units';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const DATA_PATH = 'tools/weather-match.json';
/** The fixed reference window: editions that started at 8–12 °C, same pace band. Shown beside, never subtracted. */
const REF = WEATHER_REFERENCE;
/** An example forecast so the page shows a full result before anything is typed. */
const DEFAULTS = WEATHER_EXAMPLE;
/** Fallbacks if the data file is unavailable; the loaded file's own values win. */
const PACE_FALLBACK = { lo: 180, hi: 675, step: 15 };

type TUnit = 'f' | 'c';
type Tone = 'warm' | 'cool';

const MINUS = '−';
/** Fixed-point number with a typographic minus: 60.8, 68, −1.5. Trailing zeros are trimmed unless `fixed` (5.0, not 5). */
function num(v: number, digits = 1, fixed = false): string {
  if (!Number.isFinite(v)) return '—';
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return (fixed ? (r === 0 ? 0 : r).toFixed(digits) : String(r === 0 ? 0 : r)).replace('-', MINUS);
}
/** Lenient number parsing: accepts a typographic minus, a decimal comma, and a trailing °, °F, F, °C, C or %. */
function parseNum(text: string): number | null {
  const t = text.trim().replace(/[−–]/g, '-').replace(',', '.').replace(/\s*(?:°\s*[cf]?|[cf]|%)$/i, '').trim();
  if (!t || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
/** The unit letter typed after a temperature ("64F", "18 °C"), if any. */
function typedUnit(text: string): TUnit | null {
  const m = text.trim().match(/\d\.?\s*°?\s*([cf])$/i);
  return m ? (m[1].toLowerCase() as TUnit) : null;
}
/** A half-typed number ("-", ".") is not flagged as an error while the visitor is still typing. */
const partial = (text: string) => /^[-−–.,]$/.test(text.trim());
const toUnit = (c: number, u: TUnit) => (u === 'f' ? cToF(c) : c);
const fromUnit = (v: number, u: TUnit) => (u === 'f' ? fToC(v) : v);
const unitSign = (u: TUnit) => (u === 'f' ? '°F' : '°C');
/** An absolute temperature: 64°F, 17.8°C (unspaced, as every page writes it). */
const tAbs = (c: number, u: TUnit, digits = u === 'f' ? 0 : 1) => `${num(toUnit(c, u), digits)}${unitSign(u)}`;
/** A recorded race temperature: whole °F, or °C always with one decimal (5.0°C beside 5.4°C). */
const tData = (c: number, u: TUnit, sign = true) => `${num(toUnit(c, u), u === 'f' ? 0 : 1, u === 'c')}${sign ? unitSign(u) : '°'}`;
/**
 * A temperature converted for the other unit's field, with the fewest decimals (1, then 2) that keep the
 * matched centre (the whole °C it rounds to) unchanged, so switching units never moves the window.
 */
function convertTemp(c: number, u: TUnit): string {
  for (const digits of [1, 2]) {
    const f = 10 ** digits;
    const v = Math.round(toUnit(c, u) * f) / f;
    if (Math.round(fromUnit(v, u)) === Math.round(c)) return String(v);
  }
  return String(Math.round(toUnit(c, u) * 1000) / 1000);
}
/** A window of start temperatures, in whole °F or whole °C (the windows are whole °C): "61–68°F", "16–20°C". */
const tWindow = (lo: number, hi: number, u: TUnit) => `${num(toUnit(lo, u), 0)}${toUnit(lo, u) < 0 ? ' to ' : '–'}${num(toUnit(hi, u), 0)}${unitSign(u)}`;
/** A temperature difference (×1.8, no +32), whole: "±5°F", "±3°C". */
const tSpan = (dc: number, u: TUnit) => `${num(u === 'f' ? dc * 1.8 : dc, 0)}${unitSign(u)}`;
const tDelta = (dc: number, u: TUnit) => { const v = u === 'f' ? dc * 1.8 : dc; return `${v > 0 ? '+' : ''}${num(v, 1)}${unitSign(u)}`; };
const wind = (mps: number, units: UnitSystem) => (units === 'mi' ? `${num(mps * 2.236936, 1)} mph` : `${num(mps * 3.6, 0)} km/h`);
const pctShare = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
/** A signed whole percent ("+16%"), as the sentence above the chart says it. */
const signedWhole = (fraction: number) => { const v = Math.round(fraction * 100); return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v)}%`; };
const signedPct = (fraction: number) => { const v = Math.round(fraction * 1000) / 10; return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${num(Math.abs(v), 1)}%`; };
const pctNum = (v: number) => num(v, v !== 0 && Math.abs(v) < 0.1 ? 2 : 1);
const key = (c: number, hw: number, pace: number) => `${c}|${hw}|${pace}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n === 1 ? 'one' : count(n)} ${n === 1 ? one : many}`;
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The whole-second paces per unit that fall in a band [lo, lo + step) s/km: the first is the smallest whole second at or
 * above the band's start, the last the largest whole second below its end. Every pace inside the label maps back to the band.
 */
function bandEnds(lo: number, step: number, units: UnitSystem): [number, number] {
  return [Math.ceil(perUnit(lo, units) - 1e-9), Math.ceil(perUnit(lo + step, units) - 1e-9) - 1];
}
/** "8:52–9:15/mi": a 15 s/km band shown in the visitor's units, ends inclusive to the second. */
function bandText(lo: number, step: number, units: UnitSystem): string {
  const [a, b] = bandEnds(lo, step, units);
  return `${formatDuration(a)}–${formatDuration(b)}/${units}`;
}
/**
 * A pace shown to the whole second. With a band, the rounded value is kept inside that band's label, so a goal's
 * even pace (329.9 s/km) never reads as 5:30/km beside a band of 5:15–5:29/km. The shift is under one second.
 */
function paceSeconds(sPerKm: number, units: UnitSystem, band: { lo: number; step: number } | null = null): number {
  const s = Math.round(perUnit(sPerKm, units));
  if (!band) return s;
  const [a, b] = bandEnds(band.lo, band.step, units);
  return Math.min(b, Math.max(a, s));
}
const paceText = (sPerKm: number, units: UnitSystem, band: { lo: number; step: number } | null = null) => `${formatDuration(paceSeconds(sPerKm, units, band))}/${units}`;
/** The 5–20 km stretch that defines each finish's own baseline pace: always named in km (the published definition), glossed in miles. */
const stretch = (units: UnitSystem) => (units === 'mi' ? '5–20 km (3.1–12.4 mi)' : '5–20 km');
/** Observed pace-band goals run from 2:30 to 6:30, and so do the course chooser's goals (minutes). */
const LINK_GOALS: [number, number] = [150, 390];
const hmMinutes = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dateText(iso: string | null): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[day]} ${d} ${MONTHS[mo - 1]} ${y}`;
}
function startText(start: string | null): string | null {
  if (!start) return null;
  const s = parseClock(start);
  return s === null ? start : formatClock(s);
}

/** Dew point (°C) from air temperature (°C) and relative humidity (%), inverting the same Magnus form. A direct calculation. */
function dewFromRh(t: number, rh: number): number {
  const a = 17.625;
  const b = 243.04;
  const g = Math.log(rh / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

/** The verified data file. `retry` re-runs the load after a failure (the loader drops failed requests from its cache). */
function useWeatherData(sha: string | null) {
  const [state, setState] = useState<{ data: WeatherMatchData | null; error: string | null }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!sha) return;
    let live = true;
    setState((s) => (s.error ? { data: null, error: null } : s));
    loadInsight<WeatherMatchData>(DATA_PATH, sha).then(
      (data) => { if (live) setState({ data, error: null }); },
      (e: unknown) => { if (live) setState({ data: null, error: e instanceof Error ? e.message : 'This data could not be loaded. Check the connection and try again.' }); },
    );
    return () => { live = false; };
  }, [sha, attempt]);
  const retry = () => setAttempt((n) => n + 1);
  return sha ? { ...state, retry: state.error ? retry : null } : { data: null, error: 'The weather match data is not part of this build.', retry: null };
}

type Match =
  /** `inWindow` and `refInWindow`: every race that started in each window, matched or not (a race matches with 20+ finishes at the pace band). */
  | { kind: 'ok'; row: WeatherRow; ref: WeatherRow | null; shared: number; inWindow: number; refInWindow: number }
  | { kind: 'no-row'; inWindow: WeatherEdition[]; paces: [number, number] | null; nearest: number | null; widenHelps: boolean }
  | { kind: 'pace-range'; fast: boolean }
  | { kind: 'missing'; what: 'temperature' | 'pace' };

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

/** A value that follows `value` once it has stopped changing for `ms` (keeps the status line from chattering while typing). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

type Need = 'temp' | 'dew' | 'rh' | 'dew-above' | null;

const DEFAULT_GOAL = '4:00:00';

/**
 * `paceBand`: the courses the pace band publishes, each with its observed whole-minute goals as [first, last] runs
 * (null when unknown); null when the pace band is not in this build. Read at build time by the page.
 */
export default function WeatherMatch({ sha, paceBand }: { sha: string | null; paceBand: Record<string, [number, number][] | null> | null }) {
  const { units } = useUnits();
  const [q, setQuery, ready, fromUrl] = useQueryState({ temp: '', tu: '', hum: 'dew', dew: '', rh: '', by: '', goal: DEFAULT_GOAL, pace: '', pu: '', course: '', w: '2' });
  const { data, error, retry } = useWeatherData(sha);
  // The goal stays an example until the visitor edits it or a link supplies it (a link leaves out a 4:00:00 goal, as the default).
  const [goalEdited, setGoalEdited] = useState(false);
  const setQ: typeof setQuery = (patch) => {
    if ('goal' in patch || 'by' in patch || 'pace' in patch) setGoalEdited(true);
    setQuery(patch);
  };
  // An empty temperature or dew point from a link (temp=, dew=) means cleared, not the example: keep it cleared in the URL too.
  useEffect(() => {
    if (!ready) return;
    const patch: { temp?: string; dew?: string } = {};
    if (fromUrl.has('temp') && q.temp === '') patch.temp = 'none';
    if (fromUrl.has('dew') && q.dew === '') patch.dew = 'none';
    if (patch.temp || patch.dew) setQuery(patch);
    // Once, when the URL has been read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ----- Temperature and humidity (typed in °F or °C; analysed in °C) ----- */
  const tUnit: TUnit = q.tu === 'f' || q.tu === 'c' ? q.tu : units === 'mi' ? 'f' : 'c';
  const exampleTemp = q.temp === '' && !fromUrl.has('temp');
  const tempField = exampleTemp ? String(DEFAULTS.temp[tUnit]) : q.temp === 'none' ? '' : q.temp;
  const tempIn = parseNum(tempField);
  const tempC = tempIn === null ? null : fromUnit(tempIn, tUnit);
  const tempOk = tempC !== null && tempC >= -30 && tempC <= 50;
  const tempBad = tempField !== '' && !tempOk && !partial(tempField);

  const hum = q.hum === 'rh' ? 'rh' : 'dew';
  // The example dew point belongs to the example forecast only: once a temperature is typed, the dew point is the visitor's to give.
  const exampleDew = hum === 'dew' && q.dew === '' && !fromUrl.has('dew') && exampleTemp;
  const dewField = exampleDew ? String(DEFAULTS.dew[tUnit]) : q.dew === '' || q.dew === 'none' ? '' : q.dew;
  const rhIn = hum === 'rh' && q.rh ? parseNum(q.rh) : null;
  const rhOk = rhIn !== null && rhIn >= 1 && rhIn <= 100;
  const dewIn = hum === 'dew' ? parseNum(dewField) : null;
  let dewC: number | null = null;
  if (hum === 'dew' && dewIn !== null) dewC = fromUnit(dewIn, tUnit);
  if (hum === 'rh' && rhOk && tempOk) dewC = dewFromRh(tempC!, rhIn!);
  const dewAbove = dewC !== null && tempOk && dewC > tempC! + 0.05;
  const dewOk = dewC !== null && tempOk && !dewAbove && dewC > -40;
  const dewBad = hum === 'dew' && (dewAbove || (dewField !== '' && dewIn === null && !partial(dewField)));
  const need: Need = !tempOk ? 'temp' : dewAbove ? 'dew-above' : dewOk ? null : hum === 'rh' ? 'rh' : 'dew';

  /** The dew-point text converted to another unit, one decimal (it never affects the match). */
  const dewTo = (u: TUnit) => (hum === 'dew' && q.dew !== '' && q.dew !== 'none' && dewIn !== null ? String(Math.round(toUnit(fromUnit(dewIn, tUnit), u) * 10) / 10) : q.dew);
  // Switching °F/°C straight back restores exactly what was typed; otherwise the conversion never moves the matched centre.
  const unitMemo = useRef<{ tu: TUnit; temp: string; dew: string; after: { temp: string; dew: string } } | null>(null);
  const switchUnit = (u: TUnit) => {
    if (u === tUnit) return;
    const memo = unitMemo.current;
    const next = memo && memo.tu === u && memo.after.temp === q.temp && memo.after.dew === q.dew
      ? { temp: memo.temp, dew: memo.dew }
      : { temp: q.temp === '' || q.temp === 'none' || !tempOk ? q.temp : convertTemp(tempC!, u), dew: dewTo(u) };
    unitMemo.current = { tu: tUnit, temp: q.temp, dew: q.dew, after: next };
    setQ({ tu: u, ...next });
  };
  const setTemp = (text: string) => {
    unitMemo.current = null;
    // "18c" typed while °F is selected switches the unit (and converts a typed dew point with it).
    const u = typedUnit(text);
    if (u && u !== tUnit) setQ({ temp: text, tu: u, dew: dewTo(u) });
    else setQ({ temp: text.trim() === '' ? 'none' : text, tu: tUnit });
  };
  const nudgeTemp = (delta: number) => {
    unitMemo.current = null;
    const base = tempIn ?? DEFAULTS.temp[tUnit];
    setQ({ temp: String(Math.round((base + delta) * 10) / 10), tu: tUnit });
  };
  const switchHum = (h: 'dew' | 'rh') => {
    if (h === hum) return;
    // An example dew point is not carried into the humidity field.
    if (h === 'rh') setQ({ hum: 'rh', rh: dewOk && !exampleDew ? String(Math.round(relativeHumidity(tempC!, dewC!))) : q.rh });
    else setQ({ hum: 'dew', tu: tUnit, dew: dewOk ? String(Math.round(toUnit(dewC!, tUnit) * 10) / 10) : q.dew });
  };

  /* ----- Pace: a goal time (even pace assumed) or a planned 5–20 km pace ----- */
  // A link with ?pace= and no ?by= is a pace link.
  const by = q.by === 'pace' || (q.by === '' && q.pace !== '') ? 'pace' : 'goal';
  // An empty goal (goal=) or the older goal=none means cleared.
  const goalS = by === 'goal' && q.goal !== '' && q.goal !== 'none' ? parseDuration(q.goal, 'race') : null;
  const pu: UnitSystem = q.pu === 'km' || q.pu === 'mi' ? q.pu : units;
  const paceIn = by === 'pace' && q.pace && q.pace !== 'none' ? parseDuration(q.pace, 'pace') : null;
  const paceKm = by === 'goal' ? (goalS ? goalS / MARATHON_KM : null) : paceIn ? perKm(paceIn, pu) : null;
  const goalForResearch = paceKm !== null ? (by === 'goal' ? goalS! : paceKm * MARATHON_KM) : null;

  /* ----- Matching ----- */
  const paceLo = data?.pace_range_s?.[0] ?? PACE_FALLBACK.lo;
  const paceHi = data?.pace_range_s?.[1] ?? PACE_FALLBACK.hi;
  const step = data?.pace_step_s ?? PACE_FALLBACK.step;
  const band = paceKm !== null && paceKm >= paceLo && paceKm < paceHi ? paceLo + step * Math.floor((paceKm - paceLo) / step) : null;
  const bandSpan = band !== null ? { lo: band, step } : null;
  const hw = q.w === '3' ? 3 : 2;
  const centre = tempOk ? Math.round(tempC!) + 0 : null;

  const switchBy = (next: 'goal' | 'pace') => {
    if (next === by) return;
    if (next === 'pace') setQ({ by: 'pace', pace: paceKm ? formatDuration(paceSeconds(paceKm, units, bandSpan)) : q.pace, pu: units });
    else setQ({ by: '', pace: '', pu: '', goal: paceKm ? formatDuration(Math.round(paceKm * MARATHON_KM), true) : q.goal });
  };

  const rowMap = useMemo(() => new Map((data?.rows ?? []).map((r) => [key(r.c, r.hw, r.pace), r])), [data]);
  const byId = useMemo(() => new Map((data?.editions ?? []).map((e) => [e.id, e])), [data]);
  const courses = useMemo(() => {
    const m = new Map<string, WeatherEdition[]>();
    for (const e of data?.editions ?? []) m.set(e.city, [...(m.get(e.city) ?? []), e]);
    return [...m.entries()].map(([city, eds]) => ({ city, slug: courseSlug(city), editions: eds.sort((a, b) => a.year - b.year) })).sort((a, b) => a.city.localeCompare(b.city));
  }, [data]);

  const match: Match | null = useMemo(() => {
    if (!data) return null;
    if (centre === null) return { kind: 'missing', what: 'temperature' };
    if (paceKm === null) return { kind: 'missing', what: 'pace' };
    if (band === null) return { kind: 'pace-range', fast: paceKm < paceLo };
    // Same window test as the published rows: start temperature within the half-width, ends included.
    const startedIn = (c: number, w: number) => data.editions.filter((e) => Math.abs(e.temp_c - c) <= w + 1e-9);
    const row = rowMap.get(key(centre, hw, band));
    if (row) {
      const ref = rowMap.get(key(REF.c, REF.hw, band)) ?? null;
      const shared = ref ? row.ed.filter((id) => ref.ed.includes(id)).length : 0;
      return { kind: 'ok', row, ref, shared, inWindow: startedIn(centre, hw).length, refInWindow: startedIn(REF.c, REF.hw).length };
    }
    const inWindow = startedIn(centre, hw).sort((a, b) => a.temp_c - b.temp_c);
    const here = data.rows.filter((r) => r.c === centre && r.hw === hw).map((r) => r.pace);
    const centres = data.rows.filter((r) => r.hw === hw && r.pace === band).map((r) => r.c);
    const nearest = centres.length ? centres.reduce((a, b) => (Math.abs(b - centre) < Math.abs(a - centre) ? b : a)) : null;
    return { kind: 'no-row', inWindow, paces: here.length ? [Math.min(...here), Math.max(...here)] : null, nearest, widenHelps: hw === 2 && rowMap.has(key(centre, 3, band)) };
  }, [data, centre, paceKm, band, paceLo, hw, rowMap]);

  const course = courses.find((c) => c.slug === q.course) ?? null;
  const warmCount = data ? data.editions.filter((e) => e.temp_c >= 20).length : 0;
  const coldCount = data ? data.editions.filter((e) => e.temp_c <= 3).length : 0;

  /* ----- Labels shared by panels ----- */
  const winText = centre !== null ? tWindow(centre - hw, centre + hw, tUnit) : '';
  const refText = tWindow(REF.c - REF.hw, REF.c + REF.hw, tUnit);
  const bandLabel = band !== null ? bandText(band, step, units) : '';
  // In prose a temperature is whole °F (or °C to one decimal), never 64.4°F.
  const yourTemp = tempOk ? tAbs(tempC!, tUnit) : '';
  const refTone = centre === null ? 'Reference' : centre - hw > REF.c + REF.hw ? 'Cooler mornings' : centre + hw < REF.c - REF.hw ? 'Warmer mornings' : 'Reference window';
  const widenLabel = hw === 2 ? `Widen to ±${tSpan(3, tUnit)}` : `Back to ±${tSpan(2, tUnit)}`;
  const toggleWiden = () => setQ({ w: hw === 2 ? '3' : '2' });
  // The nearest published window's centre (whole °C), typed back in the field's unit: whole °F rounds to the same centre.
  const toNearest = (c: number) => { unitMemo.current = null; setQ({ temp: tUnit === 'f' ? String(Math.round(c * 1.8 + 32)) : String(c), tu: tUnit }); };
  const yourPace = paceKm !== null ? paceText(paceKm, units, bandSpan) : '';

  /* ----- One short, settled status line for screen readers (the result sections are not live regions) ----- */
  let status = '';
  if (error) status = '';
  else if (!data) status = sha ? 'Loading the data.' : '';
  else if (match?.kind === 'ok') {
    const same = centre === REF.c && hw === REF.hw;
    status = `Mornings like ${yourTemp}: ${count(match.row.n)} finishes at ${bandLabel}. Sustained slowdown ${pctShare(match.row.sd)}.`
      + (match.ref && !same ? ` ${refTone}, ${refText}: ${pctShare(match.ref.sd)}.` : '');
  } else if (match?.kind === 'no-row') status = `Not enough past mornings like ${yourTemp} at ${bandLabel}.`;
  else if (match?.kind === 'pace-range') status = match.fast ? 'Faster than any published pace band.' : 'Slower than any published pace band.';
  else if (match?.kind === 'missing') status = match.what === 'temperature' ? (tempBad ? 'Check the start temperature.' : 'Type a start temperature.') : 'Type a goal time or a 5–20 km pace.';
  const settledStatus = useSettled(status, 700);

  const tempHintId = useId();
  const dewHintId = useId();
  // The disclosure opens on arrival when a link or an earlier visit put a value in it.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreHas = (q.dew !== '' && q.dew !== 'none') || q.hum === 'rh' || q.course !== '';
  useEffect(() => { if (ready && moreHas) setMoreOpen(true); }, [ready, moreHas]);
  const exampleGoal = by === 'goal' && q.goal === DEFAULT_GOAL && !fromUrl.has('goal') && !goalEdited;
  // The shared example marker: shown only while the forecast and goal are the untouched examples (a linked course does not change the match).
  const isExample = ready && exampleTemp && exampleDew && exampleGoal;

  /* ----- Links to other tools: the pace band takes the whole minute at or below the time; both tools observe goals from 2:30 to 6:30 ----- */
  const linkS = goalForResearch !== null ? Math.round(goalForResearch) : null;
  const linkMinute = linkS !== null ? Math.floor(linkS / 60) : null;
  const linkHM = linkMinute !== null ? hmMinutes(linkMinute) : '';
  const goalLabel = linkS === null ? '' : linkS % 60 ? formatDuration(linkS, true) : linkHM;
  const linkInRange = linkMinute !== null && linkMinute >= LINK_GOALS[0] && linkMinute <= LINK_GOALS[1];
  // A course goes with the pace-band link only when the pace band publishes it with an observed window at this minute.
  const bandKnows = course !== null && paceBand !== null && Object.prototype.hasOwnProperty.call(paceBand, course.slug);
  const bandRuns = bandKnows ? paceBand![course!.slug] : null;
  const bandCourse = linkInRange && bandKnows && (bandRuns === null || bandRuns.some(([a, b]) => linkMinute! >= a && linkMinute! <= b));
  const bandHref = `/tools/pace-band?goal=${linkHM}${bandCourse ? `&course=${course!.slug}` : ''}`;
  const bandWhy = !course || bandCourse || !linkInRange || paceBand === null ? ''
    : bandKnows ? ` (all courses: too few ${course.city} finishes at this goal)`
      : ` (all courses: ${course.city} has no band of its own)`;

  return (
    <div className="weather-match">
      <div className="tool-workspace">
        <form className="tool-inputs weather-match-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Weather match inputs">
          <h2>Your race morning</h2>

          <div className="tool-field">
            <div className="weather-match-label-row">
              <label htmlFor="weather-match-temp">Start temperature</label>
              <Choice label="Temperature unit" small value={tUnit} onChange={switchUnit} options={[{ value: 'f', label: '°F' }, { value: 'c', label: '°C' }]} />
            </div>
            <div className="tool-stepper weather-match-temp">
              <button type="button" aria-label="One degree cooler" onClick={() => nudgeTemp(-1)}>−</button>
              <div className="weather-match-num is-large">
                <input id="weather-match-temp" inputMode="decimal" autoComplete="off" spellCheck={false} value={tempField}
                  aria-invalid={tempBad || undefined} aria-describedby={tempHintId} onChange={(e) => setTemp(e.target.value)} />
                <span aria-hidden="true">{unitSign(tUnit)}</span>
              </div>
              <button type="button" aria-label="One degree warmer" onClick={() => nudgeTemp(1)}>+</button>
            </div>
            <p className={`tool-field-hint${tempBad ? ' is-error' : ''}`} id={tempHintId}>
              {tempField === '' || partial(tempField) ? 'Type the forecast temperature for your start time.'
                : tempIn === null ? `Type a number in ${unitSign(tUnit)}, such as ${DEFAULTS.temp[tUnit]}.`
                  : !tempOk ? `Try a temperature between ${tAbs(-30, tUnit, 0)} and ${tAbs(50, tUnit, 0)}.`
                    : exampleTemp ? 'An example. Type the forecast for your start time.'
                      : 'The forecast for your start time.'}
            </p>
          </div>

          <div className="tool-field">
            <span className="tool-label" id="weather-match-by">Your pace</span>
            <div role="group" aria-labelledby="weather-match-by">
              <Choice label="Enter a goal time or a 5–20 km pace" small value={by} onChange={switchBy} options={[{ value: 'goal', label: 'Goal time' }, { value: 'pace', label: '5–20K pace' }]} />
            </div>
          </div>
          {by === 'goal' ? (
            <DurationField label="Marathon goal time" large value={goalS} placeholder="4:00:00"
              onChange={(s) => setQ({ goal: s === null ? '' : formatDuration(s, true) })}
              hint={paceKm !== null ? <>Even pace {yourPace} ({paceText(paceKm, units === 'mi' ? 'km' : 'mi', bandSpan)}).</> : 'Type a goal such as 4:00:00 or 3:45.'} />
          ) : (
            <DurationField label={`Planned 5–20K pace per ${units === 'mi' ? 'mile' : 'kilometre'}`} mode="pace" large placeholder={units === 'mi' ? '9:09' : '5:41'}
              value={paceIn !== null ? paceSeconds(perKm(paceIn, pu), units, bandSpan) : null}
              onChange={(s) => setQ({ by: 'pace', pace: s === null ? '' : formatDuration(s), pu: units })}
              hint={paceKm !== null ? <>Held for the whole race: {formatDuration(Math.round(paceKm * MARATHON_KM), true)}.</> : `Type a pace such as ${units === 'mi' ? '9:09' : '5:41'}.`} />
          )}

          {/* The two optional inputs wait in one disclosure: the dew point feeds the published-research estimates only, and
              a race shows its past mornings; neither changes the match, so the answer comes right after the forecast and pace. */}
          <details className="tool-more weather-match-more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
            <summary>Dew point and your race</summary>
            <div className="tool-more-body">
              <div className="tool-field">
                <div className="weather-match-label-row">
                  <label htmlFor="weather-match-hum">{hum === 'rh' ? 'Relative humidity' : 'Dew point'} <span className="weather-match-optional">optional</span></label>
                  <Choice label="Humidity measure" small value={hum} onChange={switchHum} options={[{ value: 'dew', label: 'Dew point' }, { value: 'rh', label: 'Humidity' }]} />
                </div>
                <div className="weather-match-num">
                  {hum === 'dew' ? (
                    <input id="weather-match-hum" inputMode="decimal" autoComplete="off" spellCheck={false} value={dewField} placeholder={`e.g. ${DEFAULTS.dew[tUnit]}`}
                      aria-invalid={dewBad || undefined} aria-describedby={dewHintId}
                      onChange={(e) => { unitMemo.current = null; setQ({ dew: e.target.value.trim() === '' ? 'none' : e.target.value, tu: tUnit }); }} />
                  ) : (
                    <input id="weather-match-hum" inputMode="decimal" autoComplete="off" spellCheck={false} value={q.rh} placeholder="e.g. 70"
                      aria-invalid={(q.rh !== '' && !rhOk) || undefined} aria-describedby={dewHintId} onChange={(e) => setQ({ rh: e.target.value.trim() })} />
                  )}
                  <span aria-hidden="true">{hum === 'rh' ? '%' : unitSign(tUnit)}</span>
                </div>
                <p className={`tool-field-hint${dewBad || (hum === 'rh' && q.rh !== '' && !rhOk) ? ' is-error' : ''}`} id={dewHintId}>
                  {dewAbove ? 'A dew point cannot be above the air temperature.'
                    : dewBad ? `Type a number in ${unitSign(tUnit)}, such as ${DEFAULTS.dew[tUnit]}.`
                      : hum === 'rh' && q.rh !== '' && !rhOk ? 'Try a humidity between 1 and 100%.'
                        : hum === 'rh' && dewOk ? `Dew point ${tAbs(dewC!, tUnit)}. Used for the published-research estimates only.`
                          : 'Used for the published-research estimates only.'}
                </p>
              </div>

              <div className="tool-field">
                <label htmlFor="weather-match-course">Your race <span className="weather-match-optional">optional</span></label>
                <select id="weather-match-course" value={data ? q.course : ''} onChange={(e) => setQ({ course: e.target.value })} disabled={!data}>
                  <option value="">{data ? 'None' : error ? 'Not available' : 'Loading courses…'}</option>
                  {courses.map((c) => <option key={c.slug} value={c.slug}>{c.city}</option>)}
                </select>
                <p className="tool-field-hint">
                  {data && q.course && !course ? 'That course is not in this tool. ' : null}Shows its past race mornings. It does not change the match.
                </p>
              </div>
            </div>
          </details>
        </form>

        <div className="tool-results">
          <p className="sr-only" role="status">{settledStatus}</p>
          {error ? (
            <div className="tool-state is-error weather-match-error" role="alert">
              <p>{error} The published-research estimates below still work.</p>
              {retry ? <button type="button" className="btn btn-secondary is-compact" onClick={retry}>Try again</button> : null}
            </div>
          ) : !data ? (
            <p className="tool-state">Loading the data…</p>
          ) : match ? (
            <>
              <ResultCard match={match} units={units} tUnit={tUnit} hw={hw} centre={centre} winText={winText} refText={refText} refTone={refTone}
                bandLabel={bandLabel} yourTemp={yourTemp} yourPace={yourPace} widenLabel={widenLabel} onWiden={toggleWiden} onNearest={toNearest} isExample={isExample}
                warmCount={warmCount} coldCount={coldCount} total={data.editions.length} paceLo={paceLo} paceHi={paceHi} step={step} badTemp={tempBad} />

              {match.kind === 'ok' ? (
                <SectionsPanel match={match} units={units} centre={centre!} hw={hw} winText={winText} refText={refText} refTone={refTone} />
              ) : null}

              {centre !== null && (match.kind === 'ok' || match.kind === 'no-row') ? (
                <section className="tool-panel weather-match-editions" aria-labelledby="weather-match-editions-title">
                  <header className="tool-panel-head">
                    <h2 className="tool-panel-title" id="weather-match-editions-title">
                      {match.kind === 'ok' ? `The ${plural(match.row.ed.length, 'race')} behind it` : 'Races that started in this window'}
                    </h2>
                    {match.kind === 'ok' && match.row.ed.length < match.inWindow ? (
                      <p className="tool-panel-meta">{cap(plural(match.inWindow - match.row.ed.length, 'more race'))} started in the window with too few finishes at your pace.</p>
                    ) : null}
                  </header>
                  <TempStrip editions={data.editions} tUnit={tUnit} marker={tempC} centre={centre} hw={hw} showRef
                    emphasis={new Set(match.kind === 'ok' ? match.row.ed : match.inWindow.map((e) => e.id))}
                    legend={match.kind === 'ok' ? 'Matched' : 'Started in this window'}
                    label={`Start temperatures of all ${data.editions.length} editions, from ${tData(Math.min(...data.editions.map((e) => e.temp_c)), tUnit)} to ${tData(Math.max(...data.editions.map((e) => e.temp_c)), tUnit)}. ${match.kind === 'ok'
                      ? match.row.ed.length === match.inWindow
                        ? `${match.inWindow === 1 ? 'The one edition' : `All ${count(match.inWindow)} editions`} that started in your window, ${winText}, matched and ${match.inWindow === 1 ? 'is' : 'are'} highlighted.`
                        : `${count(match.row.ed.length)} of the ${count(match.inWindow)} editions that started in your window, ${winText}, matched and are highlighted.`
                      : match.inWindow.length === 0 ? `No edition started in your window, ${winText}.`
                        : `${cap(plural(match.inWindow.length, 'edition'))} started in your window, ${winText}, and ${match.inWindow.length === 1 ? 'is' : 'are'} highlighted.`}`} />
                  <EditionValues id="weather-match-editions-values" units={units} tUnit={tUnit} caption={match.kind === 'ok' ? 'The matched races and their race-morning weather' : 'The races that started in this window and their race-morning weather'}
                    editions={(match.kind === 'ok' ? match.row.ed.map((id) => byId.get(id)).filter((e): e is WeatherEdition => !!e) : match.inWindow).sort((a, b) => a.temp_c - b.temp_c || a.city.localeCompare(b.city))}
                    empty="No edition started in this window." />
                </section>
              ) : null}

              {course ? <CoursePanel course={course} tUnit={tUnit} units={units} tempC={tempOk ? tempC : null} centre={centre} hw={hw} all={data.editions} /> : null}
            </>
          ) : null}

          <ResearchPanel tempC={tempOk ? tempC : null} dewC={dewOk ? dewC : null} need={need} tUnit={tUnit} goal={goalForResearch} by={by} paceLabel={yourPace} />

          {linkS !== null ? (
            <ToolHandoffs label="Next steps" links={linkInRange ? [
              { href: bandHref, title: `Pace band${bandCourse ? ` for ${course!.city}` : ''}`, text: <>The mat times of finishes just under {linkHM}{bandWhy}.</> },
              { href: `/tools/course-chooser?goal=${linkHM}`, title: `Every course at ${linkHM}`, text: <>Each course’s race mornings beside how finishes at your pace held up.</> },
            ] : [
              { href: bandHref, title: 'Pace band', text: <>Even splits for {linkHM}.</> },
              { href: '/tools/course-chooser', title: 'Course chooser', text: <>Goals from 2:30 to 6:30, course by course.</> },
            ]} />
          ) : null}
          <ShareBar />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The night card (result and unavailable states share one element     */
/* tree, so the widen button keeps focus when the state changes)       */
/* ------------------------------------------------------------------ */

function ResultCard({ match, units, tUnit, hw, centre, winText, refText, refTone, bandLabel, yourTemp, yourPace, widenLabel, onWiden, onNearest, isExample,
  warmCount, coldCount, total, paceLo, paceHi, step, badTemp }: {
  match: Match; units: UnitSystem; tUnit: TUnit; hw: number; centre: number | null; winText: string; refText: string; refTone: string;
  bandLabel: string; yourTemp: string; yourPace: string; widenLabel: string; onWiden: () => void; onNearest: (c: number) => void; isExample: boolean;
  warmCount: number; coldCount: number; total: number; paceLo: number; paceHi: number; step: number; badTemp: boolean;
}) {
  const titleId = useId();
  let kicker: string;
  let figure: ReactNode;
  let body: ReactNode = null;
  let widenNote: string | null = null;
  // Widening is offered only where it finds something (or to narrow back); otherwise the nearest published window is.
  const showWiden = match.kind === 'ok' || (match.kind === 'no-row' && (hw === 3 || match.widenHelps));
  const nearest = match.kind === 'no-row' && !showWiden && match.nearest !== null ? match.nearest : null;
  const inBand = <span className="weather-match-nowrap">{bandLabel}</span>;

  if (match.kind === 'ok') {
    const { row, ref } = match;
    const same = ref !== null && centre === REF.c && hw === REF.hw;
    const cols = ref && !same ? [{ key: 'yours', name: 'Yours', sub: winText, r: row }, { key: 'ref', name: refTone, sub: refText, r: ref }] : [{ key: 'yours', name: 'Yours', sub: winText, r: row }];
    kicker = `${isExample ? 'Example · ' : ''}Mornings like ${yourTemp}`;
    // The figure is the one share; the reference's share is said beside it, so the table below carries only what the
    // sentence does not (median finish and races) and the term is linked once.
    figure = (
      <>
        <span>{pctShare(row.sd)}</span>
        <small>of {count(row.n)} finishes at {inBand} had a <SlowdownTerm /> on mornings of {winText}{ref && !same ? <>; {pctShare(ref.sd)} on {refTone.toLowerCase()}, {refText}</> : null}.</small>
      </>
    );
    body = (
      <table className="weather-match-cols">
        <caption className="sr-only">Finishes at {bandLabel} on mornings like yours{cols.length > 1 ? `, beside ${refTone.toLowerCase()}` : ''}</caption>
        <thead>
          <tr><th scope="col"><span className="sr-only">Measure</span></th>{cols.map((c) => <th key={c.key} scope="col" className={`is-${c.key}`}>{c.name}<small>{c.sub}</small></th>)}</tr>
        </thead>
        <tbody>
          <tr><th scope="row">Median finish</th>{cols.map((c) => <td key={c.key} className={`is-${c.key}`}>{formatHM(c.r.fin[1])}</td>)}</tr>
          <tr><th scope="row">Races</th>{cols.map((c) => <td key={c.key} className={`is-${c.key}`}>{count(c.r.ed.length)}</td>)}</tr>
        </tbody>
      </table>
    );
  } else if (match.kind === 'missing') {
    kicker = 'Nothing to match yet';
    figure = <span className="weather-match-ask">{match.what === 'temperature' ? (badTemp ? 'Check the start temperature' : 'Type a start temperature') : 'Type a goal time or a 5–20K pace'}</span>;
    body = <p className="tool-reading-sub">{badTemp && match.what === 'temperature' ? `Type a number in ${unitSign(tUnit)}, such as ${DEFAULTS.temp[tUnit]}.` : 'The match appears as soon as both are filled in.'}</p>;
  } else if (match.kind === 'pace-range') {
    kicker = yourPace ? `Your 5–20K pace ${yourPace}` : 'Your 5–20K pace';
    figure = <span className="weather-match-ask">{match.fast ? 'Faster than any published pace band' : 'Slower than any published pace band'}</span>;
    body = <p className="tool-reading-sub">Published 5–20K paces run from {formatDuration(bandEnds(paceLo, step, units)[0])}/{units} to {formatDuration(bandEnds(paceHi - step, step, units)[1])}/{units}.</p>;
  } else {
    const n = match.inWindow.length;
    kicker = `Mornings like ${yourTemp} · ${bandLabel}`;
    figure = <span className="weather-match-ask">Not enough past mornings like this at your pace</span>;
    body = (
      <p className="tool-reading-sub">
        {n < 3
          ? <>{n === 0 ? 'No race' : `Only ${plural(n, 'race')}`} started at {winText}. </>
          : <>{count(n)} races started at {winText}, but too few of their finishes ran a 5–20K pace of {inBand}. </>}
        {match.nearest !== null ? <>At your pace, the nearest published window is centred on {tAbs(match.nearest, tUnit, 0)}. </> : null}
        {centre !== null && centre >= 15 ? <>Warm race mornings are rare: {count(warmCount)} of {count(total)} races here started at {tAbs(20, tUnit, 0)} or warmer.</> : null}
        {centre !== null && centre <= 5 ? <>Cold race mornings are rare too: {count(coldCount)} of {count(total)} races here started at {tAbs(3, tUnit, 0)} or colder.</> : null}
      </p>
    );
    if (hw === 2 && match.widenHelps) widenNote = `A ±${tSpan(3, tUnit)} window has a published row at your pace.`;
  }

  return (
    <section className={`tool-reading night weather-match-headline${match.kind === 'ok' ? '' : ' is-unavailable'}`} aria-labelledby={titleId}>
      <div className="tool-reading-head">
        <p className="tool-reading-kicker">{kicker}</p>
        <h2 className="tool-reading-figure" id={titleId}>{figure}</h2>
      </div>
      {body}
      {showWiden ? (
        <div className="weather-match-actions">
          <button type="button" className="btn btn-secondary is-compact weather-match-widen" aria-pressed={hw === 3} onClick={onWiden}>{widenLabel}</button>
          {widenNote ? <span>{widenNote}</span> : null}
        </div>
      ) : nearest !== null ? (
        <div className="weather-match-actions">
          <button type="button" className="btn btn-secondary is-compact weather-match-widen" onClick={() => onNearest(nearest)}>Show mornings near {tAbs(nearest, tUnit, 0)}</button>
        </div>
      ) : null}
      {match.kind === 'ok' || match.kind === 'no-row' ? <EvidenceTag kind="data" /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section by section                                                  */
/* ------------------------------------------------------------------ */

function SectionsPanel({ match, units, centre, hw, winText, refText, refTone }: {
  match: Extract<Match, { kind: 'ok' }>; units: UnitSystem; centre: number; hw: number; winText: string; refText: string; refTone: string;
}) {
  const { row, ref } = match;
  const showRef = ref !== null && !(centre === REF.c && hw === REF.hw);
  // The sentence reads off the chart, in the chart's unit: the slowest section on mornings like yours, and the reference
  // in that same section (both labelled on the chart).
  const slow = row.profile.reduce((b, v, i) => (v > row.profile[b] ? i : b), 0);
  const whole = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
  const word = (v: number) => (v < 0 ? 'faster' : 'slower');
  const both = showRef && Math.round(Math.abs(row.profile[slow] - ref!.profile[slow]) * 100) >= 1;
  return (
    <section className="tool-panel weather-match-sections" aria-labelledby="weather-match-sections-title">
      <p className="tool-nugget-text" id="weather-match-sections-title">
        In {secName(slow)}, the median pace on mornings like yours was <em>{whole(row.profile[slow])} {word(row.profile[slow])}</em> than the same finishes’ 5–20K pace{both ? <>; on {refTone.toLowerCase()}, {whole(ref!.profile[slow])}</> : null}.
      </p>
      <ProfileChart mine={row.profile} reference={showRef ? ref!.profile : null} units={units} mineLabel={`Yours, ${winText}`} refLabel={`${refTone}, ${refText}`} at={slow} />
      <Values id="weather-match-sections-values" caption={`Median pace in each section against the same finishes’ 5–20K pace (positive is slower): mornings of ${winText}${showRef ? ` and ${refText}` : ''}`} count={9}>
        <table className="table">
          <thead><tr><th scope="col">Section</th><th scope="col">Yours</th>{showRef ? <th scope="col">{refTone}</th> : null}</tr></thead>
          <tbody>
            {row.profile.map((v, i) => (
              <tr key={i}><th scope="row">{secName(i)}</th><td>{signedPct(v)}</td>{showRef ? <td>{signedPct(ref!.profile[i])}</td> : null}</tr>
            ))}
            <tr><th scope="row">Finishes</th><td>{count(row.n)}</td>{showRef ? <td>{count(ref!.n)}</td> : null}</tr>
            <tr><th scope="row">Finish, 10th–90th</th><td>{formatHM(row.fin[0])}–{formatHM(row.fin[2])}</td>{showRef ? <td>{formatHM(ref!.fin[0])}–{formatHM(ref!.fin[2])}</td> : null}</tr>
            <tr><th scope="row">Pace change, {checkpointLabel(30, units)} to finish</th><td>{signedPct(row.late)}</td>{showRef ? <td>{signedPct(ref!.late)}</td> : null}</tr>
          </tbody>
        </table>
      </Values>
    </section>
  );
}

/** A section's name, the same in both unit modes: "30–35K". */
const secName = (i: number) => sectionName(SECTION_BOUNDS[i][0], SECTION_BOUNDS[i][1]);

/**
 * Median section pace against the finishes' own 5–20K pace: mornings like yours in the accent, the reference dashed in
 * ink. Slower is down, as on every pace profile. Drawn in pixels at the measured width.
 */
function ProfileChart({ mine, reference, units, mineLabel, refLabel, at }: { mine: number[]; reference: number[] | null; units: UnitSystem; mineLabel: string; refLabel: string; at: number }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 640);
  const narrow = width < 520;
  const H = narrow ? 210 : 250;
  const m = { l: 44, r: narrow ? 10 : 40, t: 14, b: 24 };
  const values = [...mine, ...(reference ?? [])].map((v) => v * 100);
  const lo = Math.min(-2, Math.floor(Math.min(...values) - 0.5));
  const hi = Math.max(4, Math.ceil(Math.max(...values) + 1));
  const span = hi - lo;
  const tickStep = span <= 8 ? 2 : span <= 16 ? 4 : span <= 32 ? 8 : 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi + 1e-9; v += tickStep) ticks.push(v);
  const x = (km: number) => m.l + (km / MARATHON_KM) * (width - m.l - m.r);
  const y = (pct: number) => m.t + ((pct - lo) / span) * (H - m.t - m.b); // slower (positive) lower down
  const mids = SECTION_BOUNDS.map(([a, b]) => (a + b) / 2);
  const path = (vals: number[]) => `M${vals.map((v, i) => `${x(mids[i]).toFixed(1)},${y(v * 100).toFixed(1)}`).join('L')}`;
  const xTicks = fitTicks([0, 10, 20, 30, 40].map((km) => ({ x: x(km), label: km ? `${km}K` : 'Start' })), width);
  // The sentence's two values, labelled on their points in the section it names, at every width: each label takes the
  // first spot (left, right, above, below) clear of both lines, the other label and the plot's edges.
  const segs = [mine, ...(reference ? [reference] : [])].flatMap((vals) => vals.slice(1).map((v, i) => [x(mids[i]), y(vals[i] * 100), x(mids[i + 1]), y(v * 100)] as const));
  const hits = (b: { x0: number; y0: number; x1: number; y1: number }) => segs.some(([ax, ay, bx, by]) => {
    for (let k = 0; k <= 12; k++) { const px = ax + ((bx - ax) * k) / 12, py = ay + ((by - ay) * k) / 12; if (px > b.x0 - 3 && px < b.x1 + 3 && py > b.y0 - 3 && py < b.y1 + 3) return true; }
    return false;
  });
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const place = (px: number, py: number, text: string) => {
    const w = text.length * 8, h = 14;
    // Beside, above and below the point, then the corners, each a little further out until one is clear.
    const spots = [8, 14, 22, 30].flatMap((d) => [[px - d - w, py - h / 2], [px + d, py - h / 2], [px - w / 2, py - d - h], [px - w / 2, py + d],
      [px - d - w, py - d - h], [px + d, py - d - h], [px - d - w, py + d], [px + d, py + d]]);
    const box = (sx: number, sy: number) => ({ x0: sx, y0: sy, x1: sx + w, y1: sy + h });
    const inside = (b: ReturnType<typeof box>) => b.x0 >= 2 && b.x1 <= width - 2 && b.y0 >= 0 && b.y1 <= H - m.b + 4;
    const clash = (b: ReturnType<typeof box>) => taken.some((t) => t.x0 < b.x1 + 4 && t.x1 > b.x0 - 4 && t.y0 < b.y1 + 2 && t.y1 > b.y0 - 2);
    const pick = spots.map(([sx, sy]) => box(sx, sy)).find((b) => inside(b) && !hits(b) && !clash(b)) ?? box(spots[0][0], spots[0][1]);
    taken.push(pick);
    return { x: pick.x0, y: pick.y0 + h - 3 };
  };
  const labelMine = place(x(mids[at]), y(mine[at] * 100), signedWhole(mine[at]));
  const labelRef = reference ? place(x(mids[at]), y(reference[at] * 100), signedWhole(reference[at])) : null;
  const describe = (vals: number[]) => vals.map((v, i) => `${secName(i)} ${signedPct(v)}`).join(', ');
  const aria = `Median section pace against the 5–20K pace. ${mineLabel}: ${describe(mine)}.${reference ? ` ${refLabel}: ${describe(reference)}.` : ''}`;
  return (
    <figure className="weather-match-figure">
      <div ref={box} className="weather-match-chart">
        <svg width={width} height={H} role="img" aria-label={aria}>
          {ticks.map((v) => (
            <g key={v} className="weather-match-grid">
              <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v === 0 ? '0' : `${v > 0 ? '+' : MINUS}${Math.abs(v)}%`}</text>
            </g>
          ))}
          <line className="weather-match-zero" x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} />
          {xTicks.map((t) => <text key={t.label} className="weather-match-tick" x={t.x} y={H - 4} textAnchor={t.anchor}>{t.label}</text>)}
          {reference ? (
            <g className="weather-match-line is-ref">
              <path d={path(reference)} />
              {reference.map((v, i) => <circle key={i} cx={x(mids[i])} cy={y(v * 100)} r={3} />)}
            </g>
          ) : null}
          <g className="weather-match-line is-yours">
            <path d={path(mine)} />
            {mine.map((v, i) => <circle key={i} cx={x(mids[i])} cy={y(v * 100)} r={3.5} />)}
          </g>
          <text x={labelMine.x} y={labelMine.y} className="weather-match-end is-yours">{signedWhole(mine[at])}</text>
          {reference && labelRef ? <text x={labelRef.x} y={labelRef.y} className="weather-match-end is-ref">{signedWhole(reference[at])}</text> : null}
        </svg>
      </div>
      <ul className="weather-match-legend" aria-hidden="true">
        <li className="is-yours"><i />{mineLabel}</li>
        {reference ? <li className="is-ref"><i />{refLabel}</li> : null}
      </ul>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Start-temperature strip and race chips                              */
/* ------------------------------------------------------------------ */

/**
 * Every edition as a dot at its start temperature, stacked where they meet: the matched ones (or a course's) emphasised,
 * your window and the reference window shaded, your forecast a line. Drawn in pixels at the measured width.
 */
function TempStrip({ editions, tUnit, marker, centre, hw, showRef, emphasis, legend, label, ring }: {
  editions: WeatherEdition[]; tUnit: TUnit; marker: number | null; centre: number | null; hw: number; showRef?: boolean;
  emphasis: Set<number>; legend: string; label: string; ring?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 640);
  const narrow = width < 480;
  const r = narrow ? 3.3 : 3.9;
  const gap = 2 * r + 1.2;
  const temps = editions.map((e) => e.temp_c);
  const loC = Math.min(-3, Math.floor(Math.min(...temps)) - 1, ...(marker !== null ? [Math.floor(marker) - 2] : []), ...(centre !== null ? [centre - hw - 1] : []));
  const hiC = Math.max(28, Math.ceil(Math.max(...temps)) + 1, ...(marker !== null ? [Math.ceil(marker) + 2] : []), ...(centre !== null ? [centre + hw + 1] : []));
  const m = { l: 12, r: 12 };
  const x = (c: number) => m.l + ((c - loC) / (hiC - loC)) * (width - m.l - m.r);

  const placed = useMemo(() => {
    const out: { e: WeatherEdition; x: number; level: number }[] = [];
    const sorted = [...editions].sort((a, b) => a.temp_c - b.temp_c || a.id - b.id);
    for (const e of sorted) {
      const px = x(e.temp_c);
      for (let k = 0; k < 200; k += 1) {
        const level = k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2;
        if (!out.some((p) => p.level === level && Math.abs(p.x - px) < gap)) { out.push({ e, x: px, level }); break; }
      }
    }
    return out;
    // x depends on width, loC and hiC only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editions, width, loC, hiC, gap]);
  const maxLevel = Math.max(1, ...placed.map((p) => Math.abs(p.level)));
  const top = 26;
  const swarmH = (2 * maxLevel + 1) * gap;
  const mid = top + 8 + swarmH / 2;
  const base = top + swarmH + 16;
  const H = base + 24;
  const ticks: number[] = [];
  if (tUnit === 'f') for (let f = Math.ceil(cToF(loC) / 10) * 10; f <= cToF(hiC); f += 10) ticks.push(fToC(f));
  else for (let c = Math.ceil(loC / 5) * 5; c <= hiC; c += 5) ticks.push(c);
  // Leave room for the unit label at the right end of the axis.
  const shownTicks = ticks.filter((c) => x(c) <= width - m.r - 24);
  const markerLabel = marker !== null ? `Your ${tAbs(marker, tUnit, tUnit === 'f' ? 0 : 1)}` : '';
  const markerW = markerLabel.length * 7;
  const markerAnchor = marker === null ? 'middle' : x(marker) - markerW / 2 < 2 ? 'start' : x(marker) + markerW / 2 > width - 2 ? 'end' : 'middle';
  // Emphasised dots drawn last so they sit on top.
  const ordered = [...placed].sort((a, b) => Number(emphasis.has(a.e.id)) - Number(emphasis.has(b.e.id)));
  return (
    <figure className="weather-match-figure">
      <div ref={box} className="weather-match-strip">
        <svg width={width} height={H} role="img" aria-label={label}>
          {showRef ? <rect x={x(REF.c - REF.hw)} y={top} width={Math.max(0, x(REF.c + REF.hw) - x(REF.c - REF.hw))} height={base - top - 6} className="weather-match-zone is-ref" /> : null}
          {centre !== null ? <rect x={x(centre - hw)} y={top} width={Math.max(0, x(centre + hw) - x(centre - hw))} height={base - top - 6} className="weather-match-zone is-yours" /> : null}
          <line className="weather-match-axis" x1={m.l} x2={width - m.r} y1={base} y2={base} />
          {shownTicks.map((c) => (
            <g key={c}>
              <line className="weather-match-axis" x1={x(c)} x2={x(c)} y1={base} y2={base + 4} />
              <text x={x(c)} y={base + 18} textAnchor="middle">{num(toUnit(c, tUnit), 0)}°</text>
            </g>
          ))}
          <text x={width - m.r} y={base + 18} textAnchor="end">{unitSign(tUnit)}</text>
          {ordered.map((p) => {
            const on = emphasis.has(p.e.id);
            return <circle key={p.e.id} cx={p.x} cy={mid + p.level * gap} r={on ? r + 0.4 : r} className={on ? (ring ? 'weather-match-dot is-ring' : 'weather-match-dot is-on') : 'weather-match-dot'} />;
          })}
          {marker !== null ? (
            <g>
              <line className="weather-match-marker" x1={x(marker)} x2={x(marker)} y1={top - 6} y2={base} />
              <text x={x(marker)} y={top - 11} textAnchor={markerAnchor} className="weather-match-marker-label">{markerLabel}</text>
            </g>
          ) : null}
        </svg>
      </div>
      <ul className="weather-match-legend is-strip" aria-hidden="true">
        {emphasis.size ? <li className={ring ? 'is-ring' : 'is-on'}><i />{legend}</li> : null}
        <li className="is-dot"><i />Other races</li>
        {centre !== null ? <li className="is-zone-yours"><i />Your window</li> : null}
        {showRef ? <li className="is-zone-ref"><i />Reference, {tWindow(REF.c - REF.hw, REF.c + REF.hw, tUnit)}</li> : null}
      </ul>
    </figure>
  );
}

/** The races behind a result, with each race morning's weather, as a Values table (no chip cloud: the strip above is the picture). */
function EditionValues({ id, editions, tUnit, units, empty, caption }: {
  id: string; editions: WeatherEdition[]; tUnit: TUnit; units: UnitSystem; empty: string; caption: string;
}) {
  if (!editions.length) return empty ? <p className="tool-note">{empty}</p> : null;
  return (
    <Values id={id} caption={caption} count={editions.length}>
      <table className="table">
        <thead><tr><th scope="col">Race</th><th scope="col">Start</th><th scope="col">Dew point</th><th scope="col">Wind</th><th scope="col">Warming, 4 hours</th></tr></thead>
        <tbody>
          {editions.map((e) => (
            <tr key={e.id}>
              <th scope="row">{e.city} {e.year}{dateText(e.date) ? <small> {dateText(e.date)}{startText(e.start) ? `, ${startText(e.start)}` : ''}</small> : null}</th>
              <td>{tData(e.temp_c, tUnit)}</td>
              <td>{e.dew_c !== null ? tData(e.dew_c, tUnit) : '—'}</td>
              <td>{e.wind_mps !== null ? wind(e.wind_mps, units) : '—'}</td>
              <td>{e.warming_c !== null ? tDelta(e.warming_c, tUnit) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Values>
  );
}

function CoursePanel({ course, tUnit, units, tempC, centre, hw, all }: {
  course: { city: string; editions: WeatherEdition[] }; tUnit: TUnit; units: UnitSystem; tempC: number | null; centre: number | null; hw: number; all: WeatherEdition[];
}) {
  const temps = course.editions.map((e) => e.temp_c);
  const [lo, hi] = [Math.min(...temps), Math.max(...temps)];
  const inWindow = centre !== null ? course.editions.filter((e) => Math.abs(e.temp_c - centre) <= hw + 1e-9).length : 0;
  const warmer = tempC !== null ? course.editions.filter((e) => e.temp_c > tempC).length : 0;
  let relation = '';
  if (tempC !== null) {
    const every = course.editions.length === 1 ? `the one ${course.city} edition` : `every ${course.city} edition`;
    if (tempC > hi) relation = `Your forecast is warmer than ${every} here.`;
    else if (tempC < lo) relation = `Your forecast is cooler than ${every} here.`;
    else relation = `${cap(plural(warmer, 'edition'))} of ${course.editions.length} started warmer than your forecast.`;
  }
  return (
    <section className="tool-panel weather-match-course" aria-labelledby="weather-match-course-title">
      <header className="tool-panel-head">
        <h2 className="tool-panel-title" id="weather-match-course-title">{course.city}: {lo === hi ? tData(lo, tUnit) : <>{tData(lo, tUnit, false)} to {tData(hi, tUnit)}</>} at the start</h2>
        <p className="tool-panel-meta">{cap(plural(course.editions.length, 'race'))}. {centre !== null ? `${inWindow === 0 ? 'None' : cap(plural(inWindow, 'race'))} started in your window. ` : ''}{relation}</p>
      </header>
      <TempStrip editions={all} tUnit={tUnit} marker={tempC} centre={centre} hw={hw} emphasis={new Set(course.editions.map((e) => e.id))} ring
        legend={course.city} label={`${course.editions.length === 1 ? `Start temperature of the one ${course.city} edition, ${tData(lo, tUnit)}` : `Start temperatures of ${count(course.editions.length)} ${course.city} editions, from ${tData(lo, tUnit)} to ${tData(hi, tUnit)}`}, among all editions.`} />
      <EditionValues id="weather-match-course-values" editions={[...course.editions].sort((a, b) => a.year - b.year)} tUnit={tUnit} units={units} empty="" caption={`${course.city}: every race morning`} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Published research panel                                            */
/* ------------------------------------------------------------------ */

/** The ACSM race flags by WBGT (°C in the position stand), each range in the visitor's unit. */
const FLAG_TEXT: Record<Flag, { name: string; range: (u: TUnit) => string; risk: string }> = {
  green: { name: 'Green', range: (u) => `below ${wb(18, u)}`, risk: 'low risk' },
  yellow: { name: 'Yellow', range: (u) => wbRange(18, 23, u), risk: 'moderate risk' },
  red: { name: 'Red', range: (u) => wbRange(23, 28, u), risk: 'high risk' },
  black: { name: 'Black', range: (u) => `above ${wb(28, u)}`, risk: 'very high risk' },
};
/** A published WBGT threshold (°C) in the visitor's unit, whole: "64°F", "18°C". */
function wb(c: number, u: TUnit): string { return u === 'f' ? `${Math.round(cToF(c))}°F` : `${num(c, 1)}°C`; }
function wbRange(lo: number, hi: number, u: TUnit): string { return u === 'f' ? `${Math.round(cToF(lo))}–${Math.round(cToF(hi))}°F` : `${num(lo, 1)}–${num(hi, 1)}°C`; }
/** A WBGT difference (°C) in the visitor's unit: "0.9°F", "0.5°C". */
function wbGap(dc: number, u: TUnit): string { return u === 'f' ? `${num(dc * 1.8, 1)}°F` : `${num(dc, 1)}°C`; }
/** A rate per degree (published per °C) in the visitor's degree. */
function perDeg(perC: number, u: TUnit): string { return u === 'f' ? `${num(perC / 1.8, 2)}% per °F` : `${num(perC, 1)}% per °C`; }
/** Mantzios et al. 2022 per °C WBGT above 15 °C (elite marathon finalists, all endurance events), read from the shared function. */
const MANTZIOS_PER_C = mantzios(16);
const MANTZIOS_BEST: [number, number] = [7.5, 15];
/** Labels for the published bands, matching the thresholds in lib/tools/weather.ts. */
const HADLEY_UPTO = [100, 110, 120, 130, 140, 150, 160, 170, 180];
const hadleyBand = (sum: number) => { const i = HADLEY_UPTO.findIndex((u) => sum <= u); return i <= 0 ? '100 or below' : `${HADLEY_UPTO[i - 1] + 1}–${HADLEY_UPTO[i]}`; };
const DEW_BELOW = [55, 60, 65, 70, 75, 80];
/** The RunnersConnect band a dew point (°F, unrounded) falls in: "60 to under 65 °F". */
const dewBand = (d: number) => { const i = DEW_BELOW.findIndex((u) => d < u); return i <= 0 ? 'below 55°F' : `${DEW_BELOW[i - 1]} to under ${DEW_BELOW[i]}°F`; };
const ELY_BANDS = [7.5, 12.5, 17.5, 22.5].map((w, i) => ({ lo: 5 + 5 * i, hi: 10 + 5 * i, ...ely(w)! }));
const NEED_TEXT: Record<Exclude<Need, null>, { short: string; note: string }> = {
  temp: { short: 'needs a start temperature', note: 'Type a start temperature to see the heat-stress estimates and published adjustments for your forecast.' },
  dew: { short: 'needs a dew point', note: 'Add a dew point or relative humidity to see the heat-stress estimates and published adjustments for your forecast.' },
  rh: { short: 'needs a humidity', note: 'Add a relative humidity between 1 and 100%, or switch to dew point, to see the heat-stress estimates and published adjustments.' },
  'dew-above': { short: 'dew point above air temperature', note: 'The dew point is above the start temperature, which cannot happen. Check both to see the heat-stress estimates and published adjustments.' },
};

interface Method {
  key: string; name: string; kind: string; range: PercentRange | null; rangeText?: string; body: ReactNode; extra?: ReactNode;
}

function Knechtle({ tUnit }: { tUnit: TUnit }) {
  return (
    <li className="weather-match-method is-statement">
      <p className="weather-match-method-head"><b>Boston finishers, 1972–2018</b><span>Published study</span></p>
      <p className="weather-match-method-body">Boston 1972–2018: across all finishers, times were about 1 min 47 s slower for each {tUnit === 'f' ? '1.8°F (1°C)' : '1°C'} rise in average air temperature.</p>
    </li>
  );
}

function ResearchPanel({ tempC, dewC, need, tUnit, goal, by, paceLabel }: {
  tempC: number | null; dewC: number | null; need: Need; tUnit: TUnit; goal: number | null; by: 'goal' | 'pace'; paceLabel: string;
}) {
  const ready = tempC !== null && dewC !== null && need === null;
  const rh = ready ? relativeHumidity(tempC, dewC) : null;
  const tw = ready ? wetBulb(tempC, rh!) : null;
  const wbgt = ready ? 0.7 * tw! + 0.3 * tempC : null;
  const flag = wbgt !== null ? acsmFlag(wbgt) : null;
  const stullOut = rh !== null && (rh < 5 || rh > 99 || tempC! < -20 || tempC! > 50);
  const tF = ready ? cToF(tempC) : null;
  const tdF = ready ? cToF(dewC) : null;
  const goalText = goal !== null ? formatDuration(goal, true) : null;
  const needShort = need ? NEED_TEXT[need].short : '';

  const methods: Method[] = [];
  // Ely et al. 2007
  {
    const cur = wbgt !== null ? ely(wbgt) : null;
    const base = ELY_BANDS[0];
    const range = cur ? { low: Math.max(0, Math.min(cur.men - base.men, cur.women - base.women)), high: Math.max(0, cur.men - base.men, cur.women - base.women) } : null;
    const bandIdx = wbgt !== null ? ELY_BANDS.findIndex((b) => wbgt >= b.lo && wbgt < b.hi) : -1;
    methods.push({
      key: 'ely', name: 'Top finishers, seven marathons', kind: 'Published study', range,
      rangeText: !ready ? undefined : wbgt! < 5 ? 'Below the table' : !cur ? 'Beyond the table' : undefined,
      body: !ready ? null : cur && bandIdx === 0 ? (
        <>At a WBGT of {wbRange(5, 10, tUnit)}, top-three finishers in seven marathons ran {num(base.men)}% (men) and {num(base.women)}% (women) off course records. No extra slowing here.</>
      ) : cur ? (
        <>Top-three finishers in seven marathons ran {num(cur.men)}% (men) and {num(cur.women)}% (women) off course records at a WBGT of {wbRange(ELY_BANDS[bandIdx].lo, ELY_BANDS[bandIdx].hi, tUnit)}, against {num(base.men)}% and {num(base.women)}% at {wbRange(5, 10, tUnit)}. Places 25 to 300 slowed more as WBGT rose.</>
      ) : wbgt! < 5 ? <>The table starts at a WBGT of {wb(5, tUnit)}; your shade estimate is cooler.</> : <>The table stops at a WBGT of {wb(25, tUnit)}; your shade estimate is warmer. Places 25 to 300 slowed more than the leaders as WBGT rose.</>,
      extra: ready ? (
        <table className="weather-match-ely">
          <thead><tr><th scope="col">WBGT</th><th scope="col">Men</th><th scope="col">Women</th></tr></thead>
          <tbody>{ELY_BANDS.map((b, i) => <tr key={b.lo} className={i === bandIdx ? 'is-current' : undefined}><td>{wbRange(b.lo, b.hi, tUnit)}{i === bandIdx ? <span className="sr-only"> (your conditions)</span> : null}</td><td>{num(b.men)}%</td><td>{num(b.women)}%</td></tr>)}</tbody>
        </table>
      ) : null,
    });
  }
  // Mantzios et al. 2022
  {
    const excess = wbgt !== null ? Math.max(0, wbgt - MANTZIOS_BEST[1]) : 0;
    methods.push({
      key: 'mantzios', name: 'Elite marathon finalists', kind: 'Published study',
      range: wbgt !== null ? mantzios(wbgt) : null,
      body: !ready ? null : excess > 0
        ? <>Your shade WBGT is {wbGap(excess, tUnit)} above {wb(15, tUnit)}. Elite marathon finalists ran about {perDeg(MANTZIOS_PER_C.low, tUnit)} slower above it; across all the study’s endurance events, about {perDeg(MANTZIOS_PER_C.high, tUnit)}.</>
        : wbgt! >= MANTZIOS_BEST[0] ? <>Inside the WBGT range of {wbRange(MANTZIOS_BEST[0], MANTZIOS_BEST[1], tUnit)}, where peak performances were most likely.</>
          : <>Cooler than the WBGT range of {wbRange(MANTZIOS_BEST[0], MANTZIOS_BEST[1], tUnit)}, where peak performances were most likely. Times were slower in the cold too.</>,
    });
  }
  // Hadley: the table is written in whole °F, so each reading is rounded before adding.
  {
    const a = tF !== null ? Math.round(tF) : null;
    const b = tdF !== null ? Math.round(tdF) : null;
    const sum = a !== null && b !== null ? a + b : null;
    const range = sum !== null ? hadley(sum, 0) : null;
    methods.push({
      key: 'hadley', name: 'Temperature + dew point table', kind: 'Rule of thumb', range,
      rangeText: sum !== null && !range ? 'No pace' : undefined,
      body: sum === null ? null : <>Temperature plus dew point is {a} + {b} = {sum}°F. {range ? (sum <= 100 ? 'At 100 or below the table suggests no change.' : `Its ${hadleyBand(sum)} band suggests running ${pctNum(range.low)}–${pctNum(range.high)}% slower.`) : 'Above 180 the table advises against hard running at all.'}</>,
    });
  }
  // RunnersConnect: the band is chosen from the unrounded dew point.
  {
    const range = tdF !== null ? dewPointBand(tdF) : null;
    methods.push({
      key: 'rc', name: 'Dew-point bands', kind: 'Rule of thumb', range,
      rangeText: tdF !== null && !range ? 'Run by effort' : undefined,
      body: tdF === null ? null : <>Dew point {num(tdF, 0)}°F{tUnit === 'c' ? ` (${num(dewC!, 1)}°C)` : ''}. {range ? (tdF < 55 ? 'Below 55°F the bands suggest no change.' : `The ${dewBand(tdF)} band suggests about ${range.low === range.high ? pctNum(range.low) : `${pctNum(range.low)}–${pctNum(range.high)}`}% slower.`) : 'At 80°F and above the bands advise running by effort, not pace.'}</>,
    });
  }
  const ranges = methods.map((m) => m.range).filter((r): r is PercentRange => r !== null);
  const spreadLo = ranges.length ? Math.min(...ranges.map((r) => r.low)) : 0;
  const spreadHi = ranges.length ? Math.max(...ranges.map((r) => r.high)) : 0;
  const spreadText = `For this forecast they run from ${pctNum(spreadLo)}% to ${pctNum(spreadHi)}%.`;

  const severe = flag === 'red' || flag === 'black';
  return (
    <section className="tool-panel weather-match-research" id="weather-match-research" aria-labelledby="weather-match-research-title">
      <header className="tool-panel-head">
        <EvidenceTag kind="research" />
        <h2 className="tool-panel-title" id="weather-match-research-title">
          {ready && flag ? <>This forecast: <em className="nowrap">{FLAG_TEXT[flag].risk}</em> on the race-flag heat-stress scale.</> : 'What published research and rules of thumb suggest'}
        </h2>
        {goalText && by === 'pace' ? <p className="tool-panel-meta">Minutes are on {goalText}, your {paceLabel} held for the whole race.</p> : null}
      </header>
      {severe ? (
        <p className="weather-match-warning" role="note">
          <strong>{FLAG_TEXT[flag!].name} flag conditions.</strong> {flag === 'black'
            ? `The ACSM position stand rates a WBGT ${FLAG_TEXT.black.range(tUnit)} as very high risk of heat exhaustion or heatstroke, and recommends that a race be postponed, rescheduled or cancelled.`
            : `The ACSM position stand rates a WBGT of ${FLAG_TEXT.red.range(tUnit)} as high risk: any runner may get heat exhaustion or heatstroke, and anyone particularly sensitive to heat or humidity probably should not run.`} Follow your race organiser’s guidance on the day.
        </p>
      ) : null}
      {need ? <p className="tool-note">{NEED_TEXT[need].note}</p> : null}
      <details className="tool-more weather-match-more-research">
        <summary>{ready ? `Four published estimates: ${spreadHi === 0 ? 'no slowing' : `${pctNum(spreadLo)}% to ${pctNum(spreadHi)}% slower`}` : 'Four published estimates'}</summary>
        <div className="tool-more-body">
          <dl className="tool-cells weather-match-conditions">
            <div><dt>Relative humidity</dt><dd>{rh !== null ? `${num(rh, 0)}%` : '—'}{rh === null ? <small>{needShort}</small> : null}</dd></div>
            <div><dt>Wet-bulb</dt><dd>{tw !== null ? tAbs(tw, tUnit) : '—'}{tw === null ? <small>{needShort}</small> : stullOut ? <small>outside the tested range</small> : null}</dd></div>
            <div><dt>Shade WBGT ≈</dt><dd>{wbgt !== null ? tAbs(wbgt, tUnit) : '—'}{wbgt === null ? <small>{needShort}</small> : null}</dd></div>
            <div className={flag ? `weather-match-flag is-${flag}` : 'weather-match-flag'}><dt>ACSM race flag</dt><dd>{flag ? <><i aria-hidden="true" />{FLAG_TEXT[flag].name}</> : '—'}<small>{flag ? `WBGT ${FLAG_TEXT[flag].range(tUnit)}: ${FLAG_TEXT[flag].risk}${flag === 'green' ? ', not none' : ''}` : needShort}</small></dd></div>
          </dl>
          <ul className="weather-match-methods">
            {ready ? methods.map((mth) => (
              <li key={mth.key} className="weather-match-method">
                <p className="weather-match-method-head"><b>{mth.name}</b><span>{mth.kind}</span></p>
                <p className="weather-match-method-range">
                  {mth.rangeText ?? (mth.range ? (Math.abs(mth.range.low - mth.range.high) < 1e-9 ? `${pctNum(mth.range.low)}%` : `${pctNum(mth.range.low)}–${pctNum(mth.range.high)}%`) : '—')}
                  {mth.range && goal !== null ? (
                    <small>{mth.range.high === 0 ? 'No time added' : <>≈ {mss(goal * mth.range.low / 100)}{Math.abs(mth.range.low - mth.range.high) < 1e-9 ? '' : `–${mss(goal * mth.range.high / 100)}`} min on {goalText}</>}</small>
                  ) : null}
                </p>
                {mth.body ? <p className="weather-match-method-body">{mth.body}</p> : null}
                {mth.extra}
              </li>
            )) : null}
            <Knechtle tUnit={tUnit} />
          </ul>
          {ready ? (
            <p className="tool-note">
              {spreadHi === 0
                ? <><strong>In warmer, more humid weather these methods disagree several-fold.</strong> For this forecast none of them suggests slowing.</>
                : spreadLo === 0 || spreadHi / spreadLo >= 3
                  ? <><strong>These methods disagree several-fold for the same weather.</strong> {spreadText}</>
                  : <><strong>These methods give different figures for the same weather.</strong> {spreadText}</>}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
