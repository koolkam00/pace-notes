'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, EvidencePanel, ExampleNote, ShareBar } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight } from '@/lib/insights';
import { courseSlug } from '@/lib/tools/links';
import type { WeatherEdition, WeatherMatch as WeatherMatchData, WeatherRow } from '@/lib/tools/data';
import { MARATHON_KM, perKm, perUnit } from '@/lib/tools/pace';
import { formatClock, formatDuration, formatHM, parseClock, parseDuration } from '@/lib/tools/time';
import { acsmFlag, cToF, dewPointBand, ely, fToC, hadley, mantzios, relativeHumidity, wetBulb, type Flag, type PercentRange } from '@/lib/tools/weather';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { SECTION_BOUNDS, checkpointLabel, count, mss, sectionLabel } from '@/lib/viz/format';
import type { UnitSystem } from '@/lib/units';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const DATA_PATH = 'tools/weather-match.json';
/** The fixed reference window: editions that started at 8–12 °C, same pace band. Shown beside, never subtracted. */
const REF = { c: 10, hw: 2 };
/** An example forecast so the page shows a full result before anything is typed. */
const DEFAULTS = { temp: { f: 64, c: 18 }, dew: { f: 55, c: 13 } } as const;
/** Fallbacks if the data file is unavailable; the loaded file's own values win. */
const PACE_FALLBACK = { lo: 180, hi: 675, step: 15 };
/** Temperatures the slider covers, in °C (the published windows run from about −2 to 28 °C). */
const SLIDER_C: [number, number] = [-2, 30];
const SLIDER_F: [number, number] = [28, 86];

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
const other = (u: TUnit): TUnit => (u === 'f' ? 'c' : 'f');
/** An absolute temperature: 64 °F, 17.8 °C. */
const tAbs = (c: number, u: TUnit, digits = u === 'f' ? 0 : 1) => `${num(toUnit(c, u), digits)} ${unitSign(u)}`;
/** A recorded race temperature: whole °F, or °C always with one decimal (5.0 °C beside 5.4 °C). */
const tData = (c: number, u: TUnit, sign = true) => `${num(toUnit(c, u), u === 'f' ? 0 : 1, u === 'c')}${sign ? ` ${unitSign(u)}` : '°'}`;
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
/** A window of start temperatures: "60.8–68 °F", "16–20 °C". */
const tWindow = (lo: number, hi: number, u: TUnit) => `${num(toUnit(lo, u), 1)}${toUnit(lo, u) < 0 ? ' to ' : '–'}${num(toUnit(hi, u), 1)} ${unitSign(u)}`;
/** A temperature difference (×1.8, no +32): "±3.6 °F". */
const tSpan = (dc: number, u: TUnit) => `${num(u === 'f' ? dc * 1.8 : dc, 1)} ${unitSign(u)}`;
const tDelta = (dc: number, u: TUnit) => { const v = u === 'f' ? dc * 1.8 : dc; return `${v > 0 ? '+' : ''}${num(v, 1)} ${unitSign(u)}`; };
const wind = (mps: number, units: UnitSystem) => (units === 'mi' ? `${num(mps * 2.236936, 1)} mph` : `${num(mps * 3.6, 0)} km/h`);
const pctShare = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
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

/** Dew point (°C) from air temperature (°C) and relative humidity (%), inverting the same Magnus form. Arithmetic. */
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
  const winAlt = centre !== null ? tWindow(centre - hw, centre + hw, other(tUnit)) : '';
  const refText = tWindow(REF.c - REF.hw, REF.c + REF.hw, tUnit);
  const bandLabel = band !== null ? bandText(band, step, units) : '';
  const yourTemp = tempOk ? tAbs(tempC!, tUnit, 1) : '';
  const refTone = centre === null ? 'Reference' : centre - hw > REF.c + REF.hw ? 'Cooler mornings' : centre + hw < REF.c - REF.hw ? 'Warmer mornings' : 'Reference window';
  const widenLabel = hw === 2 ? `Widen to ±${tSpan(3, tUnit)}` : `Back to ±${tSpan(2, tUnit)}`;
  const toggleWiden = () => setQ({ w: hw === 2 ? '3' : '2' });
  const yourPace = paceKm !== null ? paceText(paceKm, units, bandSpan) : '';

  /* ----- One short, settled status line for screen readers (the result sections are not live regions) ----- */
  let status = '';
  if (error) status = '';
  else if (!data) status = sha ? 'Loading the data.' : '';
  else if (match?.kind === 'ok') {
    const same = centre === REF.c && hw === REF.hw;
    const m = match.row.ed.length;
    status = `${m === match.inWindow ? `${cap(plural(m, 'edition'))} started at ${winText}, ${m === 1 ? 'with' : 'each with'}` : `${m} of ${match.inWindow} editions that started at ${winText} had`} 20 or more finishes at ${bandLabel}, ${count(match.row.n)} finishes in all. Sustained slowdown ${pctShare(match.row.sd)}, averaged over the editions with each counted equally.`
      + (match.ref && !same ? ` ${refTone}, ${refText}: ${pctShare(match.ref.sd)}, averaged the same way.` : '');
  } else if (match?.kind === 'no-row') status = `Not enough past mornings like ${yourTemp} at ${bandLabel}.`;
  else if (match?.kind === 'pace-range') status = match.fast ? 'Faster than any published pace band.' : 'Slower than any published pace band.';
  else if (match?.kind === 'missing') status = match.what === 'temperature' ? (tempBad ? 'Check the start temperature.' : 'Type a start temperature.') : 'Type a goal time or a 5–20 km pace.';
  const settledStatus = useSettled(status, 700);

  const tempHintId = useId();
  const dewHintId = useId();
  const sliderRange = tUnit === 'f' ? SLIDER_F : SLIDER_C;
  const sliderValue = tempIn === null ? DEFAULTS.temp[tUnit] : Math.min(sliderRange[1], Math.max(sliderRange[0], tempIn));
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
    : bandKnows ? ` (all courses: ${course.city} had fewer than 100 such finishes)`
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
            <div className="weather-match-temp">
              <button type="button" className="weather-match-nudge" aria-label="One degree cooler" onClick={() => nudgeTemp(-1)}>−</button>
              <div className="weather-match-num is-large">
                <input id="weather-match-temp" inputMode="decimal" autoComplete="off" spellCheck={false} value={tempField}
                  aria-invalid={tempBad || undefined} aria-describedby={tempHintId} onChange={(e) => setTemp(e.target.value)} />
                <span aria-hidden="true">{unitSign(tUnit)}</span>
              </div>
              <button type="button" className="weather-match-nudge" aria-label="One degree warmer" onClick={() => nudgeTemp(1)}>+</button>
            </div>
            <input type="range" className="weather-match-slider" min={sliderRange[0]} max={sliderRange[1]} step={tUnit === 'f' ? 1 : 0.5} value={sliderValue}
              aria-label={`Start temperature, ${unitSign(tUnit)}`} aria-valuetext={`${num(sliderValue, 1)} ${unitSign(tUnit)}`}
              onChange={(e) => { unitMemo.current = null; setQ({ temp: e.target.value, tu: tUnit }); }} />
            <p className={`tool-field-hint${tempBad ? ' is-error' : ''}`} id={tempHintId}>
              {tempField === '' || partial(tempField) ? 'Type the forecast temperature for your start time.'
                : tempIn === null ? `Type a number in ${unitSign(tUnit)}, such as ${DEFAULTS.temp[tUnit]}.`
                  : !tempOk ? `Try a temperature between ${tAbs(-30, tUnit, 0)} and ${tAbs(50, tUnit, 0)}.`
                    : exampleTemp ? `An example (${tAbs(tempC!, other(tUnit))}). Type the forecast for your start time.`
                      : `From your own forecast, at the start time (${tAbs(tempC!, other(tUnit))}).`}
            </p>
          </div>

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
                    : hum === 'rh' && dewOk ? `Dew point ${tAbs(dewC!, tUnit)} at your start temperature (Magnus formula). Used only in the published-research panel.`
                      : exampleDew ? 'An example, like the temperature. Used only in the published-research panel; it never filters the Pace Notes data.'
                        : 'Used only in the published-research panel. It never filters the Pace Notes data.'}
            </p>
          </div>

          <div className="tool-field">
            <span className="tool-label" id="weather-match-by">Your pace</span>
            <div role="group" aria-labelledby="weather-match-by">
              <Choice label="Enter a goal time or a 5–20 km pace" small value={by} onChange={switchBy} options={[{ value: 'goal', label: 'Goal time' }, { value: 'pace', label: '5–20 km pace' }]} />
            </div>
          </div>
          {by === 'goal' ? (
            <DurationField label="Marathon goal time" large value={goalS} placeholder="4:00:00"
              onChange={(s) => setQ({ goal: s === null ? '' : formatDuration(s, true) })}
              hint={paceKm !== null ? <>Assumption: an even {yourPace} ({paceText(paceKm, units === 'mi' ? 'km' : 'mi', bandSpan)}), used as your 5–20 km pace.{exampleGoal ? ' 4:00:00 is an example goal.' : ''}</> : 'Type a goal such as 4:00:00 or 3:45.'} />
          ) : (
            <DurationField label={`Planned 5–20 km pace per ${units === 'mi' ? 'mile' : 'kilometre'}`} mode="pace" large placeholder={units === 'mi' ? '9:09' : '5:41'}
              value={paceIn !== null ? paceSeconds(perKm(paceIn, pu), units, bandSpan) : null}
              onChange={(s) => setQ({ by: 'pace', pace: s === null ? '' : formatDuration(s), pu: units })}
              hint={paceKm !== null ? <>The pace you plan to hold from the 5 km mat to the 20 km mat{units === 'mi' ? ' (3.1 to 12.4 mi)' : ''}. Arithmetic: held for the whole race it is {formatDuration(Math.round(paceKm * MARATHON_KM), true)}.</> : `Type a pace such as ${units === 'mi' ? '9:09' : '5:41'}.`} />
          )}

          <div className="tool-field">
            <label htmlFor="weather-match-course">Your race <span className="weather-match-optional">optional</span></label>
            <select id="weather-match-course" value={data ? q.course : ''} onChange={(e) => setQ({ course: e.target.value })} disabled={!data}>
              <option value="">{data ? 'None' : error ? 'Not available' : 'Loading courses…'}</option>
              {courses.map((c) => <option key={c.slug} value={c.slug}>{c.city} · {plural(c.editions.length, 'edition')}</option>)}
            </select>
            <p className="tool-field-hint">
              {data && q.course && !course ? 'That course is not in this tool’s data. ' : null}Shows that course’s past race-morning temperatures. It does not change the match.
            </p>
          </div>
        </form>

        <div className="tool-results">
          <p className="sr-only" role="status">{settledStatus}</p>
          {error ? (
            <div className="tool-state is-error weather-match-error" role="alert">
              <p>{error} The published-research panel below still works.</p>
              {retry ? <button type="button" className="button-secondary" onClick={retry}>Try again</button> : null}
            </div>
          ) : !data ? (
            <p className="tool-state">Loading the data…</p>
          ) : match ? (
            <>
              {isExample ? (
                <ExampleNote>
                  Example forecast and goal: {DEFAULTS.temp[tUnit]} {unitSign(tUnit)} at the start, dew point {DEFAULTS.dew[tUnit]} {unitSign(tUnit)}, and a {DEFAULT_GOAL} goal.{course ? ` ${course.city}’s past race mornings are further down.` : ''} Type yours; everything updates as you type.
                </ExampleNote>
              ) : null}
              <ResultHead match={match} units={units} tUnit={tUnit} hw={hw} centre={centre} winText={winText} winAlt={winAlt} refText={refText} refTone={refTone}
                bandLabel={bandLabel} yourTemp={yourTemp} yourPace={yourPace} widenLabel={widenLabel} onWiden={toggleWiden}
                warmCount={warmCount} coldCount={coldCount} total={data.editions.length} paceLo={paceLo} paceHi={paceHi} step={step} badTemp={tempBad} />

              {match.kind === 'ok' ? (
                <EvidencePanel kind="data" title="How finishes at your pace held up"
                  meta={<>The two columns in full, then each 5 km section’s median pace against the same finishes’ own {stretch(units)} pace. Rates and medians count every edition equally.</>}>
                  <ComparisonTable match={match} units={units} winText={winText} refText={refText} refTone={refTone} bandLabel={bandLabel} centre={centre!} hw={hw} />
                  <h3 className="weather-match-subhead">Section by section</h3>
                  <ProfileChart mine={match.row.profile} reference={match.ref && !(centre === REF.c && hw === REF.hw) ? match.ref.profile : null} units={units}
                    mineLabel={`Mornings like yours, ${winText}`} refLabel={`${refTone}, ${refText}`} />
                  <p className="tool-note">
                    {SLOWDOWN_DEFINITION} Source: <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">{SLOWDOWN_CITATION.label}</a>. Each share here is worked out per edition and averaged with every edition counted equally. Shares are observed shares of complete finishes, not anyone’s chance; runners who stopped are not in the data.
                  </p>
                </EvidencePanel>
              ) : null}

              {centre !== null && (match.kind === 'ok' || match.kind === 'no-row') ? (
                <EvidencePanel kind="data" title={match.kind === 'ok' ? `The ${plural(match.row.ed.length, 'edition')} behind this window` : 'Editions that started in this window'}
                  meta={<>
                    {match.kind === 'ok' && match.row.ed.length < match.inWindow ? `${cap(plural(match.inWindow - match.row.ed.length, 'more edition'))} started in the window with fewer than 20 finishes at your pace band; ${match.inWindow - match.row.ed.length === 1 ? 'it is' : 'they are'} grey in the shaded window below. ` : ''}
                    Weather is the modelled hour at each edition’s scheduled start, at one point in the city: context, not what any runner felt. Wave starts, sun and shade are unknown.{match.kind === 'ok' ? ' No per-edition results are shown, because one edition’s finishes at your pace can number fewer than 100.' : ''}
                  </>}>
                  <TempStrip editions={data.editions} tUnit={tUnit} marker={tempC} centre={centre} hw={hw} showRef
                    emphasis={new Set(match.kind === 'ok' ? match.row.ed : match.inWindow.map((e) => e.id))} emphasisTone={match.kind === 'ok' ? 'warm' : 'ink'}
                    legend={match.kind === 'ok' ? 'Matched edition (20+ finishes at your pace)' : 'Started in this window'}
                    label={`Start temperatures of all ${data.editions.length} editions in this tool's data, from ${tData(Math.min(...data.editions.map((e) => e.temp_c)), tUnit)} to ${tData(Math.max(...data.editions.map((e) => e.temp_c)), tUnit)}. ${match.kind === 'ok'
                      ? match.row.ed.length === match.inWindow
                        ? `${match.inWindow === 1 ? 'The one edition' : `All ${count(match.inWindow)} editions`} that started in your window, ${winText}, had 20 or more finishes at your pace and ${match.inWindow === 1 ? 'is' : 'are'} highlighted.`
                        : `${count(match.row.ed.length)} of the ${count(match.inWindow)} editions that started in your window, ${winText}, had 20 or more finishes at your pace and are highlighted.`
                      : match.inWindow.length === 0 ? `No edition started in your window, ${winText}.`
                        : `${cap(plural(match.inWindow.length, 'edition'))} started in your window, ${winText}, and ${match.inWindow.length === 1 ? 'is' : 'are'} highlighted.`}`} />
                  <EditionChips units={units} tUnit={tUnit}
                    editions={(match.kind === 'ok' ? match.row.ed.map((id) => byId.get(id)).filter((e): e is WeatherEdition => !!e) : match.inWindow).sort((a, b) => a.temp_c - b.temp_c || a.city.localeCompare(b.city))}
                    empty="No edition in this tool’s data started in this window." />
                </EvidencePanel>
              ) : null}

              {course ? <CoursePanel course={course} tUnit={tUnit} units={units} tempC={tempOk ? tempC : null} centre={centre} hw={hw} all={data.editions} /> : null}
            </>
          ) : null}

          <ResearchPanel tempC={tempOk ? tempC : null} dewC={dewOk ? dewC : null} need={need} tUnit={tUnit} goal={goalForResearch} by={by} paceLabel={yourPace} />

          {linkS !== null ? (
            <div className="tool-callout no-print">
              <strong>{by === 'goal' ? `Racing for ${goalLabel}?` : `${yourPace} held for the whole race is ${goalLabel}.`}</strong>{' '}
              {linkInRange ? (
                <>
                  The <Link href={bandHref}>pace band{bandCourse ? ` for ${course!.city}` : ''}</Link> shows what finishes that came in within five minutes under {linkHM} ran at each 5 km mat{linkS % 60 ? `, using the whole minute at or below ${goalLabel}` : ''}{bandWhy}, and the{' '}
                  <Link href={`/tools/course-chooser?goal=${linkHM}`}>course chooser</Link> lists each course’s race-morning temperatures beside how finishes at your pace held up.
                </>
              ) : (
                <>
                  The <Link href={bandHref}>pace band</Link> prints even splits for {linkHM}. Its observed mat times, and the <Link href="/tools/course-chooser">course chooser</Link>, cover goals from 2:30 to 6:30, so the chooser opens without yours.
                </>
              )}
            </div>
          ) : null}
          <ShareBar />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Headline (result and unavailable states share one element tree, so  */
/* the widen button keeps focus when the state changes)                */
/* ------------------------------------------------------------------ */

function ResultHead({ match, units, tUnit, hw, centre, winText, winAlt, refText, refTone, bandLabel, yourTemp, yourPace, widenLabel, onWiden,
  warmCount, coldCount, total, paceLo, paceHi, step, badTemp }: {
  match: Match; units: UnitSystem; tUnit: TUnit; hw: number; centre: number | null; winText: string; winAlt: string; refText: string; refTone: string;
  bandLabel: string; yourTemp: string; yourPace: string; widenLabel: string; onWiden: () => void;
  warmCount: number; coldCount: number; total: number; paceLo: number; paceHi: number; step: number; badTemp: boolean;
}) {
  const titleId = useId();
  let kicker: string;
  let title: string;
  let group: ReactNode;
  let widenNote: string | null = null;
  let body: ReactNode = null;
  const showWiden = match.kind === 'ok' || match.kind === 'no-row';
  const inBand = <span className="weather-match-nowrap">{bandLabel}</span>;

  if (match.kind === 'ok') {
    const { row, ref, shared, inWindow } = match;
    const m = row.ed.length;
    const same = ref !== null && centre === REF.c && hw === REF.hw;
    kicker = `Mornings like ${yourTemp}`;
    title = m === inWindow
      ? `${inWindow === 1 ? 'One past marathon edition' : `${count(inWindow)} past marathon editions`} started at ${winText}`
      : `${count(m)} of ${count(inWindow)} past marathon editions that started at ${winText} had 20+ finishes at your pace`;
    group = (
      <p>
        {m === inWindow
          ? <>Each had 20 or more finishes that ran {stretch(units)} at {inBand}, your pace band: {count(row.n)} finishes in all.</>
          : <>Those {count(m)} hold {count(row.n)} finishes that ran {stretch(units)} at {inBand}, your pace band; the other {count(inWindow - m)} had fewer than 20 such finishes.</>}
        {' '}The window is ±{tSpan(hw, tUnit)} around your forecast ({winAlt}).
      </p>
    );
    body = (
      <>
        <div className={`weather-match-cols${same || !ref ? ' is-single' : ''}`}>
          <HeadColumn tone="warm" title={same ? 'Mornings like yours (the reference window)' : 'Mornings like yours'} sub={winText} row={row} started={inWindow} units={units} />
          {ref && !same ? <HeadColumn tone="cool" title={refTone} sub={refText} row={ref} started={match.refInWindow} units={units} /> : null}
        </div>
        <p className="weather-match-foot">
          {ref && !same ? <>Two descriptive columns, not a heat penalty: the editions differ in course, field and year as well as weather.{shared ? ` ${cap(plural(shared, 'edition is', 'editions are'))} in both windows.` : ''} </>
            : !ref ? 'The reference window has no published row at this pace band. '
              : 'Your forecast falls in the reference window itself, so there is one column. '}
          Finishes are grouped by the 5–20 km pace they actually ran that day, not by goal or ability{ref && !same ? ': on a warmer morning runners may already have started slower, so the same band can hold different runners in each column' : ''}.
        </p>
      </>
    );
  } else if (match.kind === 'missing') {
    kicker = 'Nothing to match yet';
    title = match.what === 'temperature' ? (badTemp ? 'Check the start temperature' : 'Type a start temperature') : 'Type a goal time or a 5–20 km pace';
    group = <p>{badTemp && match.what === 'temperature' ? `Type a number in ${unitSign(tUnit)}, such as ${DEFAULTS.temp[tUnit]}.` : 'The match appears as soon as both are filled in.'}</p>;
  } else if (match.kind === 'pace-range') {
    kicker = yourPace ? `Your 5–20 km pace ${yourPace}` : 'Your 5–20 km pace';
    title = match.fast ? 'Faster than any published pace band' : 'Slower than any published pace band';
    group = <p>Pace Notes groups 5–20 km paces from {formatDuration(bandEnds(paceLo, step, units)[0])}/{units} to {formatDuration(bandEnds(paceHi - step, step, units)[1])}/{units}. Outside that range there are too few finishes in any window to publish.</p>;
  } else {
    const n = match.inWindow.length;
    kicker = `Window ±${tSpan(hw, tUnit)} · ${bandLabel}`;
    title = `Not enough past mornings like ${yourTemp} at your pace`;
    group = (
      <>
        <p>
          {n < 3
            ? <>{n === 0 ? 'No edition' : `Only ${plural(n, 'edition')}`} in this tool’s data started at {winText}. A comparison needs at least 3 editions, each with 20 or more finishes at your 5–20 km pace ({inBand}), and at least 100 such finishes in all.</>
            : <>{count(n)} editions started at {winText}, but fewer than 3 of them had 20 or more finishes at a 5–20 km pace of {inBand}, or they had fewer than 100 such finishes between them.</>}
        </p>
        <p>
          {match.paces ? <>At these temperatures there are published rows for 5–20 km paces from {formatDuration(bandEnds(match.paces[0], step, units)[0])}/{units} to {formatDuration(bandEnds(match.paces[1], step, units)[1])}/{units}. </> : null}
          {match.nearest !== null ? <>At your pace, the nearest published window is centred on {tAbs(match.nearest, tUnit, tUnit === 'f' ? 1 : 0)}. </> : null}
          {centre !== null && centre >= 15 ? <>Warm race mornings are rare: {count(warmCount)} of {count(total)} editions here started at {tAbs(20, tUnit, 0)} or warmer.</> : null}
          {centre !== null && centre <= 5 ? <>Cold race mornings are rare too: {count(coldCount)} of {count(total)} editions here started at {tAbs(3, tUnit, 0)} or colder.</> : null}
        </p>
      </>
    );
    if (hw === 2) widenNote = match.widenHelps ? `A ±${tSpan(3, tUnit)} window has a published row at your pace.` : `A ±${tSpan(3, tUnit)} window has no published row at your pace either.`;
  }

  return (
    <section className={`tool-headline night weather-match-headline${match.kind === 'ok' ? '' : ' is-unavailable'}`} aria-labelledby={titleId}>
      <div className="weather-match-head">
        <span className="evidence-badge evidence-data">Pace Notes data</span>
        <p className="weather-match-kicker">{kicker}</p>
        <h2 className="weather-match-title" id={titleId}>{title}</h2>
        <div className="weather-match-group">{group}</div>
        {showWiden ? (
          <div className="weather-match-actions">
            <button type="button" className="weather-match-widen" aria-pressed={hw === 3} onClick={onWiden}>{widenLabel}</button>
            {widenNote ? <span>{widenNote}</span> : null}
          </div>
        ) : null}
      </div>
      {body}
    </section>
  );
}

function HeadColumn({ tone, title, sub, row, started, units }: { tone: Tone; title: string; sub: string; row: WeatherRow; started: number; units: UnitSystem }) {
  const m = row.ed.length;
  return (
    <div className={`weather-match-col is-${tone}`}>
      <p className="weather-match-col-title"><i aria-hidden="true" />{title}</p>
      <p className="weather-match-col-sub">
        <span className="weather-match-nowrap">{sub}</span> · <span className="weather-match-nowrap">{m === started ? plural(m, 'edition') : `${count(m)} of ${count(started)} editions`}</span> · <span className="weather-match-nowrap">{count(row.n)} finishes</span> in all
      </p>
      <dl>
        <div><dt>Sustained slowdown</dt><dd>{pctShare(row.sd)}</dd><dd className="weather-match-dd-sub">average of the editions, each counted equally</dd></div>
        <div><dt>After {checkpointLabel(20, units)}</dt><dd>{mss(row.after20, true)}</dd><dd className="weather-match-dd-sub">beyond the 5–20 km pace; editions counted equally</dd></div>
        <div><dt>Median finish</dt><dd>{formatHM(row.fin[1])}</dd><dd className="weather-match-dd-sub">all finishes pooled; 10th–90th <span className="weather-match-nowrap">{formatHM(row.fin[0])}–{formatHM(row.fin[2])}</span></dd></div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison table                                                    */
/* ------------------------------------------------------------------ */

function ComparisonTable({ match, units, winText, refText, refTone, bandLabel, centre, hw }: {
  match: Extract<Match, { kind: 'ok' }>; units: UnitSystem; winText: string; refText: string; refTone: string; bandLabel: string; centre: number; hw: number;
}) {
  const { row, ref } = match;
  const showRef = ref !== null && !(centre === REF.c && hw === REF.hw);
  type Col = { r: WeatherRow; started: number };
  const cols: Col[] = showRef ? [{ r: row, started: match.inWindow }, { r: ref!, started: match.refInWindow }] : [{ r: row, started: match.inWindow }];
  const lines: { label: ReactNode; cell: (c: Col) => ReactNode; key?: boolean }[] = [
    { label: 'Editions that started in the window', cell: (c) => count(c.started) },
    { label: <>Editions with 20+ finishes at <span className="weather-match-nowrap">{bandLabel}</span></>, cell: (c) => count(c.r.ed.length) },
    { label: <>Finishes at <span className="weather-match-nowrap">{bandLabel}</span> in those editions (pooled)</>, cell: (c) => count(c.r.n) },
    { label: 'Sustained slowdown (editions counted equally)', cell: (c) => pctShare(c.r.sd), key: true },
    { label: <>Median time after {checkpointLabel(20, units)} beyond the 5–20 km pace</>, cell: (c) => mss(c.r.after20, true) },
    { label: <>Median pace change, {checkpointLabel(30, units)} to finish</>, cell: (c) => signedPct(c.r.late) },
    { label: 'Median finish (10th–90th percentile, finishes pooled)', cell: (c) => <>{formatHM(c.r.fin[1])}<small>{formatHM(c.r.fin[0])}–{formatHM(c.r.fin[2])}</small></> },
  ];
  return (
    <div className="tool-table-wrap weather-match-compare">
      <table className="tool-table wrap-first">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Measure</span></th>
            <th scope="col"><span className="weather-match-key is-warm" aria-hidden="true" />Mornings like yours<small>{winText}</small></th>
            {showRef ? <th scope="col"><span className="weather-match-key is-cool" aria-hidden="true" />{refTone}<small>{refText}</small></th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={l.key ? 'is-key' : undefined}>
              <th scope="row">{l.label}</th>
              {cols.map((c, j) => <td key={j}>{l.cell(c)}</td>)}
            </tr>
          ))}
        </tbody>
        <caption>
          Rates and medians count every edition equally (each edition is one weather observation); the finish count and finish percentiles pool all {showRef ? 'finishes in each column' : 'the finishes'} and only describe the field. Finishes are grouped by the 5–20 km pace they ran in the race, not by goal or ability. The {checkpointLabel(30, units)}-to-finish change compares that stretch’s pace with the 5–20 km pace. Columns are never subtracted.
        </caption>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section profile chart                                               */
/* ------------------------------------------------------------------ */

function ProfileChart({ mine, reference, units, mineLabel, refLabel }: { mine: number[]; reference: number[] | null; units: UnitSystem; mineLabel: string; refLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 640);
  const narrow = width < 520;
  const H = narrow ? 236 : 272;
  const m = { l: 44, r: narrow ? 14 : 104, t: 30, b: 40 };
  const values = [...mine, ...(reference ?? [])].map((v) => v * 100);
  const lo = Math.min(-2, Math.floor(Math.min(...values) - 0.5));
  const hi = Math.max(4, Math.ceil(Math.max(...values) + 1));
  const span = hi - lo;
  const tickStep = span <= 8 ? 1 : span <= 16 ? 2 : span <= 32 ? 4 : 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi + 1e-9; v += tickStep) ticks.push(v);
  const x = (km: number) => m.l + (km / MARATHON_KM) * (width - m.l - m.r);
  const y = (pct: number) => m.t + ((hi - pct) / span) * (H - m.t - m.b);
  const mids = SECTION_BOUNDS.map(([a, b]) => (a + b) / 2);
  const path = (vals: number[]) => `M${vals.map((v, i) => `${x(mids[i]).toFixed(1)},${y(v * 100).toFixed(1)}`).join('L')}`;
  const xTicks = units === 'km' ? [0, 10, 20, 30, 40].map((km) => ({ km, label: String(km) })) : [0, 5, 10, 15, 20, 25].map((mi) => ({ km: mi * 1.609344, label: String(mi) }));
  // Direct labels at the end of each line, kept apart.
  const endMine = y(mine[8] * 100);
  let endRef = reference ? y(reference[8] * 100) : 0;
  let endMineY = endMine;
  if (reference && Math.abs(endRef - endMineY) < 15) {
    const midY = (endRef + endMineY) / 2;
    if (mine[8] >= reference[8]) { endMineY = midY - 8; endRef = midY + 8; } else { endMineY = midY + 8; endRef = midY - 8; }
  }
  const describe = (vals: number[]) => vals.map((v, i) => `${sectionLabel(i, units)} ${signedPct(v)}`).join(', ');
  const aria = `Median section pace relative to the 5–20 km pace. ${mineLabel}: ${describe(mine)}.${reference ? ` ${refLabel}: ${describe(reference)}.` : ''}`;
  return (
    <figure className="weather-match-figure">
      <ul className="weather-match-legend" aria-hidden="true">
        <li><i className="is-warm-line" />{mineLabel}</li>
        {reference ? <li><i className="is-cool-line" />{refLabel}</li> : null}
      </ul>
      <div ref={box} className="viz weather-match-chart">
        <svg width={width} height={H} role="img" aria-label={aria}>
          <rect x={x(5)} y={m.t - 6} width={x(20) - x(5)} height={H - m.t - m.b + 6} className="weather-match-baseline-zone" />
          <text x={(x(5) + x(20)) / 2} y={m.t - 12} textAnchor="middle" className="axis-label">{narrow ? 'baseline' : '5–20 km baseline'}</text>
          {ticks.map((v) => (
            <g key={v} className="grid">
              <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v === 0 ? '0' : `${v > 0 ? '+' : MINUS}${Math.abs(v)}%`}</text>
            </g>
          ))}
          <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />
          {xTicks.filter((t) => narrow || x(MARATHON_KM) - x(t.km) > 36).map((t) => (
            <g key={t.label}>
              <line x1={x(t.km)} x2={x(t.km)} y1={H - m.b} y2={H - m.b + 4} stroke="var(--line-2)" />
              <text x={x(t.km)} y={H - m.b + 17} textAnchor="middle">{t.label}</text>
            </g>
          ))}
          <text x={x(MARATHON_KM)} y={H - m.b + 17} textAnchor="end">{narrow ? '' : 'Finish'}</text>
          <text x={m.l} y={H - 4} className="axis-label">{units === 'mi' ? 'miles' : 'km'}</text>
          <text x={4} y={12} className="axis-label">slower ↑</text>
          {reference ? (
            <g>
              <path d={path(reference)} fill="none" stroke="var(--blue)" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />
              {reference.map((v, i) => <rect key={i} x={x(mids[i]) - 3.5} y={y(v * 100) - 3.5} width={7} height={7} fill="var(--card)" stroke="var(--blue)" strokeWidth={1.8} />)}
            </g>
          ) : null}
          <path d={path(mine)} fill="none" stroke="var(--orange)" strokeWidth={2.6} strokeLinejoin="round" />
          {mine.map((v, i) => <circle key={i} cx={x(mids[i])} cy={y(v * 100)} r={4} fill="var(--orange)" stroke="var(--card)" strokeWidth={1.5} />)}
          {!narrow ? (
            <g>
              <text x={x(mids[8]) + 10} y={endMineY + 4} className="annotation weather-match-end is-warm">Yours {signedPct(mine[8])}</text>
              {reference ? <text x={x(mids[8]) + 10} y={endRef + 4} className="annotation weather-match-end is-cool">Ref. {signedPct(reference[8])}</text> : null}
            </g>
          ) : null}
        </svg>
      </div>
      <details className="weather-match-details">
        <summary>Section paces as a table</summary>
        <div className="tool-table-wrap">
          <table className="tool-table">
            <thead><tr><th scope="col">Section</th><th scope="col">Yours</th>{reference ? <th scope="col">Reference</th> : null}</tr></thead>
            <tbody>
              {mine.map((v, i) => (
                <tr key={i} className={i >= 1 && i <= 3 ? 'is-key' : undefined}>
                  <th scope="row">{sectionLabel(i, units)}</th><td>{signedPct(v)}</td>{reference ? <td>{signedPct(reference[i])}</td> : null}
                </tr>
              ))}
            </tbody>
            <caption>Median pace in each section against the same finishes’ 5–20 km pace (shaded rows), averaged with every edition counted equally. These are observed 5 km mat sections, not mile splits.</caption>
          </table>
        </div>
      </details>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Start-temperature strip and race chips                              */
/* ------------------------------------------------------------------ */

function TempStrip({ editions, tUnit, marker, centre, hw, showRef, emphasis, emphasisTone, legend, label, ring }: {
  editions: WeatherEdition[]; tUnit: TUnit; marker: number | null; centre: number | null; hw: number; showRef?: boolean;
  emphasis: Set<number>; emphasisTone: 'warm' | 'ink'; legend: string; label: string; ring?: boolean;
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
      <div ref={box} className="viz weather-match-strip">
        <svg width={width} height={H} role="img" aria-label={label}>
          {showRef ? <rect x={x(REF.c - REF.hw)} y={top} width={x(REF.c + REF.hw) - x(REF.c - REF.hw)} height={base - top - 6} className="weather-match-zone is-cool" /> : null}
          {centre !== null ? <rect x={x(centre - hw)} y={top} width={x(centre + hw) - x(centre - hw)} height={base - top - 6} className="weather-match-zone is-warm" /> : null}
          <line x1={m.l} x2={width - m.r} y1={base} y2={base} stroke="var(--line-2)" />
          {shownTicks.map((c) => (
            <g key={c}>
              <line x1={x(c)} x2={x(c)} y1={base} y2={base + 4} stroke="var(--line-2)" />
              <text x={x(c)} y={base + 17} textAnchor="middle">{num(toUnit(c, tUnit), 0)}°</text>
            </g>
          ))}
          <text x={width - m.r} y={base + 17} textAnchor="end" className="axis-label">{unitSign(tUnit)}</text>
          {ordered.map((p) => {
            const on = emphasis.has(p.e.id);
            return (
              <circle key={p.e.id} cx={p.x} cy={mid + p.level * gap} r={on ? r + 0.4 : r}
                className={on ? (ring ? 'weather-match-dot is-ring' : `weather-match-dot is-${emphasisTone}`) : 'weather-match-dot'} />
            );
          })}
          {marker !== null ? (
            <g>
              <line x1={x(marker)} x2={x(marker)} y1={top - 6} y2={base} stroke="var(--ink)" strokeWidth={1.6} />
              <text x={x(marker)} y={top - 11} textAnchor={markerAnchor} className="annotation">{markerLabel}</text>
            </g>
          ) : null}
        </svg>
      </div>
      <ul className="weather-match-legend is-strip" aria-hidden="true">
        {emphasis.size ? <li><i className={ring ? 'is-dot-ring' : `is-dot-${emphasisTone}`} />{legend}</li> : null}
        <li><i className="is-dot" />Other editions in this data</li>
        {centre !== null ? <li><i className="is-zone-warm" />Your window</li> : null}
        {showRef ? <li><i className="is-zone-cool" />Reference, {tWindow(REF.c - REF.hw, REF.c + REF.hw, tUnit)}</li> : null}
      </ul>
    </figure>
  );
}

function EditionChips({ editions, tUnit, units, empty, limit = 18, showYearFirst = false }: {
  editions: WeatherEdition[]; tUnit: TUnit; units: UnitSystem; empty: string; limit?: number; showYearFirst?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const detailId = useId();
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());
  const moreRef = useRef<HTMLButtonElement>(null);
  const shown = all ? editions : editions.slice(0, limit);
  const current = editions.find((e) => e.id === open) ?? null;
  // Close removes the detail (and its button), so focus goes back to the chip that opened it, or to "Show all" if that chip is hidden.
  const close = () => {
    const chip = open !== null ? chipRefs.current.get(open) : undefined;
    setOpen(null);
    (chip ?? moreRef.current)?.focus();
  };
  if (!editions.length) return <p className="tool-note">{empty}</p>;
  return (
    <div className="weather-match-chipset">
      <ul className="weather-match-chips">
        {shown.map((e) => (
          <li key={e.id}>
            <button type="button" aria-expanded={open === e.id} aria-controls={detailId} onClick={() => setOpen(open === e.id ? null : e.id)}
              ref={(el) => { if (el) chipRefs.current.set(e.id, el); else chipRefs.current.delete(e.id); }}>
              <b>{showYearFirst ? e.year : `${e.city} ${e.year}`}</b><span>{tData(e.temp_c, tUnit, false)}<span className="sr-only">{tUnit === 'f' ? 'F' : 'C'}</span></span>
            </button>
          </li>
        ))}
        {editions.length > limit ? (
          <li><button type="button" className="weather-match-more" ref={moreRef} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${editions.length}`}</button></li>
        ) : null}
      </ul>
      <div id={detailId} aria-live="polite">
        {current ? (
          <div className="weather-match-detail">
            <p className="weather-match-detail-title"><b>{current.city} {current.year}</b>{[dateText(current.date), startText(current.start) ? `scheduled start ${startText(current.start)}` : null].filter(Boolean).map((t) => <span key={t}> · {t}</span>)}</p>
            <dl>
              <div><dt>Start temperature</dt><dd>{tData(current.temp_c, tUnit)} <small>({tData(current.temp_c, other(tUnit))})</small></dd></div>
              <div><dt>Dew point</dt><dd>{current.dew_c !== null ? tData(current.dew_c, tUnit) : '—'}</dd></div>
              <div><dt>Wind</dt><dd>{current.wind_mps !== null ? wind(current.wind_mps, units) : '—'}</dd></div>
              <div><dt>Warming, first 4 hours</dt><dd>{current.warming_c !== null ? tDelta(current.warming_c, tUnit) : '—'}</dd></div>
            </dl>
            <button type="button" className="weather-match-close" onClick={close}>Close</button>
          </div>
        ) : <p className="weather-match-chip-hint">Tap an edition for its race-morning weather.</p>}
      </div>
    </div>
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
    <EvidencePanel kind="data" title={`${course.city}: past race mornings`}
      meta={<>{course.city}: {lo === hi ? tData(lo, tUnit) : <>{tData(lo, tUnit, false)} to {tData(hi, tUnit)}</>} across {plural(course.editions.length, 'edition')} in this tool’s data. {centre !== null ? `${inWindow === 0 ? 'No edition' : cap(plural(inWindow, 'edition'))} started in your window. ` : ''}{relation}</>}>
      <TempStrip editions={all} tUnit={tUnit} marker={tempC} centre={centre} hw={hw} emphasis={new Set(course.editions.map((e) => e.id))} emphasisTone="ink" ring
        legend={`${course.city} edition`} label={`${course.editions.length === 1 ? `Start temperature of the one ${course.city} edition, ${tData(lo, tUnit)}` : `Start temperatures of ${count(course.editions.length)} ${course.city} editions, from ${tData(lo, tUnit)} to ${tData(hi, tUnit)}`}, among all editions in this tool's data.`} />
      <EditionChips editions={course.editions} tUnit={tUnit} units={units} empty="" showYearFirst limit={24} />
      <p className="tool-note">Editions left out of this tool’s data (start-delay screens, shifted mats or missing weather) are listed under How this works.</p>
    </EvidencePanel>
  );
}

/* ------------------------------------------------------------------ */
/* Published research panel                                            */
/* ------------------------------------------------------------------ */

const FLAG_TEXT: Record<Flag, { name: string; range: string; risk: string }> = {
  green: { name: 'Green', range: 'below 18 °C', risk: 'low risk of heat illness, not none' },
  yellow: { name: 'Yellow', range: '18–23 °C', risk: 'moderate risk' },
  red: { name: 'Red', range: '23–28 °C', risk: 'high risk' },
  black: { name: 'Black', range: 'above 28 °C', risk: 'very high risk' },
};
/** The race-risk categories above are from the ACSM position stand on distance running (Armstrong et al. 1996). */
const ACSM_1996 = { label: 'ACSM position stand on heat and cold illnesses during distance running (Armstrong et al. 1996)', url: 'https://pubmed.ncbi.nlm.nih.gov/8970149/' };
/** Mantzios et al. 2022 per °C WBGT above 15 °C (elite marathon finalists, all endurance events), read from the shared function. */
const MANTZIOS_PER_C = mantzios(16);
const MANTZIOS_BEST: [number, number] = [7.5, 15];
/** Labels for the published bands, matching the thresholds in lib/tools/weather.ts. */
const HADLEY_UPTO = [100, 110, 120, 130, 140, 150, 160, 170, 180];
const hadleyBand = (sum: number) => { const i = HADLEY_UPTO.findIndex((u) => sum <= u); return i <= 0 ? '100 or below' : `${HADLEY_UPTO[i - 1] + 1}–${HADLEY_UPTO[i]}`; };
const DEW_BELOW = [55, 60, 65, 70, 75, 80];
/** The RunnersConnect band a dew point (°F, unrounded) falls in: "60 to under 65 °F". */
const dewBand = (d: number) => { const i = DEW_BELOW.findIndex((u) => d < u); return i <= 0 ? 'below 55 °F' : `${DEW_BELOW[i - 1]} to under ${DEW_BELOW[i]} °F`; };
const ELY_BANDS = [7.5, 12.5, 17.5, 22.5].map((w, i) => ({ lo: 5 + 5 * i, hi: 10 + 5 * i, ...ely(w)! }));
const NEED_TEXT: Record<Exclude<Need, null>, { short: string; note: string }> = {
  temp: { short: 'needs a start temperature', note: 'Type a start temperature to see the heat-stress estimates and published adjustments for your forecast.' },
  dew: { short: 'needs a dew point', note: 'Add a dew point or relative humidity to see the heat-stress estimates and published adjustments for your forecast.' },
  rh: { short: 'needs a humidity', note: 'Add a relative humidity between 1 and 100%, or switch to dew point, to see the heat-stress estimates and published adjustments.' },
  'dew-above': { short: 'dew point above air temperature', note: 'The dew point is above the start temperature, which cannot happen. Check both to see the heat-stress estimates and published adjustments.' },
};

interface Method {
  key: string; name: string; kind: string; range: PercentRange | null; rangeText?: string; body: ReactNode; cite: { label: string; url: string }; extra?: ReactNode;
}

function Knechtle() {
  return (
    <li className="weather-match-method is-statement">
      <p className="weather-match-method-head"><b>Knechtle et al. 2019</b><span>Study · statement only</span></p>
      <p className="weather-match-method-body">Boston 1972–2018: across all finishers, times were about 1 min 47 s slower for each 1 °C rise in average air temperature (1.8 °F). One race’s association, shown as reported and not applied to your goal.</p>
      <p className="weather-match-cite"><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6407773" rel="noopener noreferrer">PLoS One 14:e0212797</a></p>
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
      key: 'ely', name: 'Ely et al. 2007', kind: 'Study · top finishers', range,
      rangeText: !ready ? undefined : wbgt! < 5 ? 'Below the table' : !cur ? 'Beyond the table' : undefined,
      body: !ready ? null : cur && bandIdx === 0 ? (
        <>At 5–10 °C WBGT, the table’s coolest band, top-three finishers in seven marathons ran {num(base.men)}% (men) and {num(base.women)}% (women) off course records. The range is the extra over that band, so it is zero here.</>
      ) : cur ? (
        <>Top-three finishers in seven marathons ran {num(cur.men)}% (men) and {num(cur.women)}% (women) off course records at {ELY_BANDS[bandIdx].lo}–{ELY_BANDS[bandIdx].hi} °C WBGT, against {num(base.men)}% and {num(base.women)}% at 5–10 °C. The range is the extra over that coolest band. Places 25 to 300 slowed more as WBGT rose.</>
      ) : wbgt! < 5 ? <>The table starts at 5 °C WBGT; your shade estimate is cooler.</> : <>The table stops at 25 °C WBGT; your shade estimate is warmer. Places 25 to 300 slowed more than the leaders as WBGT rose.</>,
      cite: { label: 'Med Sci Sports Exerc 39:487', url: 'https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/' },
      extra: ready ? (
        <table className="weather-match-ely">
          <thead><tr><th scope="col">WBGT</th><th scope="col">Men</th><th scope="col">Women</th></tr></thead>
          <tbody>{ELY_BANDS.map((b, i) => <tr key={b.lo} className={i === bandIdx ? 'is-current' : undefined}><td>{b.lo}–{b.hi} °C{i === bandIdx ? <span className="sr-only"> (your conditions)</span> : null}</td><td>{num(b.men)}%</td><td>{num(b.women)}%</td></tr>)}</tbody>
        </table>
      ) : null,
    });
  }
  // Mantzios et al. 2022
  {
    const excess = wbgt !== null ? Math.max(0, wbgt - MANTZIOS_BEST[1]) : 0;
    methods.push({
      key: 'mantzios', name: 'Mantzios et al. 2022', kind: 'Study · elite finalists',
      range: wbgt !== null ? mantzios(wbgt) : null,
      body: !ready ? null : excess > 0
        ? <>Your shade WBGT is {num(excess)} °C above 15 °C. Elite marathon finalists ran about {num(MANTZIOS_PER_C.low)}% slower per °C above it; across all the study’s endurance events, about {num(MANTZIOS_PER_C.high)}% per °C.</>
        : wbgt! >= MANTZIOS_BEST[0] ? <>Inside the 7.5–15 °C WBGT range where the study found peak performances most likely: no warm-side slope applies.</>
          : <>Cooler than the study’s 7.5–15 °C WBGT best range. It also reports slower times in the cold, which this panel does not show.</>,
      cite: { label: 'Med Sci Sports Exerc 54:153', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8677617/' },
    });
  }
  // Hadley: the table is written in whole °F, so each reading is rounded before adding.
  {
    const a = tF !== null ? Math.round(tF) : null;
    const b = tdF !== null ? Math.round(tdF) : null;
    const sum = a !== null && b !== null ? a + b : null;
    const range = sum !== null ? hadley(sum, 0) : null;
    methods.push({
      key: 'hadley', name: 'Hadley’s temperature + dew point table', kind: 'Rule of thumb', range,
      rangeText: sum !== null && !range ? 'No pace' : undefined,
      body: sum === null ? null : <>Temperature plus dew point is {a} + {b} = {sum} (°F{tUnit === 'c' ? ', each rounded to a whole degree' : ''}, as the table is written). {range ? (sum <= 100 ? 'At 100 or below the table suggests no change.' : `Its ${hadleyBand(sum)} band suggests running ${pctNum(range.low)}–${pctNum(range.high)}% slower.`) : 'Above 180 the table advises against hard running at all.'}</>,
      cite: { label: 'Mark Hadley, via Triple Threat Life', url: 'https://triplethreatlife.substack.com/p/how-to-adjust-run-pace-in-the-heat' },
    });
  }
  // RunnersConnect: the band is chosen from the unrounded dew point.
  {
    const range = tdF !== null ? dewPointBand(tdF) : null;
    methods.push({
      key: 'rc', name: 'RunnersConnect dew-point bands', kind: 'Rule of thumb', range,
      rangeText: tdF !== null && !range ? 'Run by effort' : undefined,
      body: tdF === null ? null : <>Dew point {num(tdF, 1)} °F{tUnit === 'c' ? ` (${num(dewC!, 1)} °C)` : ''}. {range ? (tdF < 55 ? 'Below 55 °F the bands suggest no change.' : `The ${dewBand(tdF)} band suggests about ${range.low === range.high ? pctNum(range.low) : `${pctNum(range.low)}–${pctNum(range.high)}`}% slower.`) : 'At 80 °F and above the bands advise running by effort, not pace.'}</>,
      cite: { label: 'RunnersConnect', url: 'https://runnersconnect.net/dew-point-effect-running/' },
    });
  }
  const ranges = methods.map((m) => m.range).filter((r): r is PercentRange => r !== null);
  const spreadLo = ranges.length ? Math.min(...ranges.map((r) => r.low)) : 0;
  const spreadHi = ranges.length ? Math.max(...ranges.map((r) => r.high)) : 0;
  const spreadText = `For this forecast they run from ${pctNum(spreadLo)}% to ${pctNum(spreadHi)}%.`;

  return (
    <EvidencePanel kind="research" id="weather-match-research" title="What published research and rules of thumb suggest"
      meta={<>Not calculated from Pace Notes data. Each method is shown on its own, as a range, with its source; none is combined with another or with the Pace Notes columns, and none is used by any other tool.{goalText ? <> Minutes are arithmetic: the published percentage × {by === 'goal' ? `your ${goalText} goal` : `${goalText}, your ${paceLabel} held for the whole race`}.</> : null}</>}>
      <div className="weather-match-conditions">
        <div>
          <span>Relative humidity</span>
          <b>{rh !== null ? `${num(rh, 0)}%` : '—'}</b>
          <small>{rh !== null ? 'Magnus formula' : needShort}</small>
        </div>
        <div>
          <span>Wet-bulb</span>
          <b>{tw !== null ? tAbs(tw, tUnit) : '—'}</b>
          <small>{tw !== null ? (stullOut ? 'Stull 2011 · outside its tested range' : 'Stull 2011') : needShort}</small>
        </div>
        <div>
          <span>Shade WBGT ≈</span>
          <b>{wbgt !== null ? tAbs(wbgt, tUnit) : '—'}</b>
          <small>{wbgt !== null ? (tUnit === 'f' ? `${num(wbgt, 1)} °C · 0.7 wet-bulb + 0.3 air` : '0.7 wet-bulb + 0.3 air') : needShort}</small>
        </div>
        <div className={flag ? `weather-match-flag is-${flag}` : 'weather-match-flag'}>
          <span>ACSM race flag</span>
          <b>{flag ? <><i aria-hidden="true" />{FLAG_TEXT[flag].name}</> : '—'}</b>
          <small>{flag ? `WBGT ${FLAG_TEXT[flag].range}: ${FLAG_TEXT[flag].risk}` : needShort}</small>
        </div>
      </div>
      {flag === 'red' || flag === 'black' ? (
        <p className="weather-match-warning" role="note">
          <strong>{FLAG_TEXT[flag].name} flag conditions.</strong> {flag === 'black'
            ? 'The ACSM position stand rates WBGT above 28 °C as very high risk of heat exhaustion or heatstroke, and recommends that a race be postponed, rescheduled or cancelled.'
            : 'The ACSM position stand rates WBGT of 23–28 °C as high risk: any runner may get heat exhaustion or heatstroke, and anyone particularly sensitive to heat or humidity probably should not run.'} Follow your race organiser’s guidance on the day.
        </p>
      ) : null}
      {need ? <p className="tool-state">{NEED_TEXT[need].note}</p> : null}
      <ul className="weather-match-methods">
        {ready ? methods.map((mth) => (
          <li key={mth.key} className="weather-match-method">
            <p className="weather-match-method-head"><b>{mth.name}</b><span>{mth.kind}</span></p>
            <p className="weather-match-method-range">
              {mth.rangeText ?? (mth.range ? (Math.abs(mth.range.low - mth.range.high) < 1e-9 ? `${pctNum(mth.range.low)}%` : `${pctNum(mth.range.low)}–${pctNum(mth.range.high)}%`) : '—')}
            </p>
            {mth.range && goal !== null ? (
              <p className="weather-match-method-min">
                {mth.range.high === 0 ? 'No time added' : <>≈ {mss(goal * mth.range.low / 100)}{Math.abs(mth.range.low - mth.range.high) < 1e-9 ? '' : `–${mss(goal * mth.range.high / 100)}`} min on {goalText}</>}
              </p>
            ) : null}
            {mth.body ? <p className="weather-match-method-body">{mth.body}</p> : null}
            {mth.extra}
            <p className="weather-match-cite"><a href={mth.cite.url} rel="noopener noreferrer">{mth.cite.label}</a></p>
          </li>
        )) : null}
        <Knechtle />
      </ul>
      {ready ? (
        <p className="weather-match-disagree">
          {spreadHi === 0
            ? <><strong>In warmer, more humid weather these methods disagree several-fold.</strong> For this forecast none of them suggests slowing.</>
            : spreadLo === 0 || spreadHi / spreadLo >= 3
              ? <><strong>These methods disagree several-fold for the same weather.</strong> {spreadText}</>
              : <><strong>These methods give different figures for the same weather.</strong> {spreadText}</>}
          {' '}Ely and Mantzios describe elite and top finishers; Hadley and RunnersConnect are rules of thumb with no published validation.
        </p>
      ) : null}
      <p className="tool-note">
        The WBGT is a shade estimate from temperature and dew point: direct sun can add several degrees, and a psychrometric wet-bulb only approximates the natural wet-bulb a WBGT meter reads. The simplified “ACSM-87” WBGT is not used: it is not an accurate approximation of WBGT (Brimicombe et al. 2023). Flag tiers are the race-risk categories of the <a href={ACSM_1996.url} rel="noopener noreferrer">{ACSM_1996.label}</a>; they describe heat-illness risk for the field, not a pace. The current ACSM expert consensus (Roberts et al. 2023) sets region-specific WBGT thresholds for training and competition instead.
      </p>
    </EvidencePanel>
  );
}
