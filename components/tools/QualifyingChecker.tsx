'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, ExampleNote, ShareBar } from '@/components/tools/ui';
import Values from '@/components/ui/Values';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import {
  BOSTON_CUTOFFS, CHICAGO_ROUTE, STANDARDS, VERIFIED_AT, bostonDownhillIndex, bostonDownhillIndexMetres, clearedCutoffs, comparisonText, evaluate,
  type Band, type Division, type QualifyInput, type QualifyResult, type Standard,
} from '@/lib/tools/qualifying';
import { formatDuration, parseDuration } from '@/lib/tools/time';
import { METRES_PER_FOOT, type UnitSystem } from '@/lib/units';

/* ---------- Constants ---------- */

/** Example race date: the Berlin 2026 race day (inside the Boston, New York, London, Chicago and Berlin windows). */
const EXAMPLE_RACE = '2026-09-27';
/** Division, time and race date go in the URL. The birth date never does (see docs/TOOLS.md, Privacy). */
const DEFAULTS = { div: 'W', t: '3:29:00', race: EXAMPLE_RACE };
const DIVISIONS: { value: string; label: string; division: Division }[] = [
  { value: 'M', label: 'Men', division: 'men' },
  { value: 'W', label: 'Women', division: 'women' },
  { value: 'NB', label: 'Non-binary', division: 'nonbinary' },
];
const DIVISION_WORD: Record<Division, string> = { men: 'men', women: 'women', nonbinary: 'non-binary' };
/** An example runner so the page shows a full result before anything is typed. Flagged on screen until replaced. */
const EXAMPLE_BIRTH = '1984-05-20';
const STORAGE_KEY = 'pace-notes-qualifying-birth';
const SHORT: Record<string, string> = { boston: 'Boston', nyc: 'New York', london: 'London', chicago: 'Chicago', berlin: 'Berlin', sydney: 'Sydney' };
const hms = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;
/**
 * Boston 2028's window runs "through 2027 registration week", which the B.A.A. had not dated when this was checked
 * (it is usually mid-September). Until lib/tools/qualifying.ts lists an end, a time run after September 2027 is treated
 * as outside the window, and one run during September 2027 is flagged as depending on the registration dates.
 */
const BOSTON_WINDOW_LATEST = '2027-09-30';
const BOSTON_WINDOW_UNSURE_FROM = '2027-09-01';
/**
 * London Good For Age page (checked VERIFIED_AT): a runner whose only time is from the virtual TCS London Marathon MyWay
 * also needs an in-person half marathon in the same window, strictly under these times. [youngest age in band, men, women]
 */
const LONDON_MYWAY_HALF: [number, number, number][] = [
  [18, hms(1, 23, 37), hms(1, 44, 23)], [40, hms(1, 26, 0), hms(1, 46, 47)], [45, hms(1, 28, 9), hms(1, 48, 13)],
  [50, hms(1, 30, 32), hms(1, 51, 34)], [55, hms(1, 32, 56), hms(1, 53, 42)], [60, hms(1, 44, 23), hms(2, 5, 25)],
  [65, hms(1, 51, 34), hms(2, 19, 16)], [70, hms(2, 19, 16), hms(2, 47, 13)], [75, hms(2, 26, 27), hms(2, 56, 33)],
  [80, hms(2, 33, 22), hms(3, 5, 52)],
];
/** London Championship entry page (checked VERIFIED_AT): marathon sub-2:38:00 / sub-3:10:00, same window as Good For Age. */
const LONDON_CHAMPIONSHIP = {
  men: hms(2, 38), women: hms(3, 10), closes: '2026-10-20',
  source: { label: 'London Marathon Events: Championship entry', url: 'https://www.londonmarathonevents.co.uk/london-marathon/championship-entry' },
};
const BOSTON_STANDARD = STANDARDS.find((s) => s.key === 'boston')!;
const SYDNEY_MAX_DROP_M = STANDARDS.find((s) => s.key === 'sydney')?.maxNetDropM;
/** The only NYRR marathon in the New York window (NYRR guaranteed entry needs a time from it, or from a listed NYRR half). */
const NYRR_MARATHON_DATE = STANDARDS.find((s) => s.key === 'nyc')?.nyrrMarathonDate;
/** Who to name when a race does not say whether a time equal to the standard qualifies. */
const ORGANISER: Record<string, string> = { boston: 'The B.A.A.', nyc: 'NYRR', london: 'London Marathon Events', chicago: 'The Chicago Marathon', berlin: 'The Berlin Marathon', sydney: 'The Sydney Marathon' };
/** Goals the pace band accepts (its even-pace band). */
const BAND_RANGE = [90 * 60, 480 * 60] as const;
const within = (t: number, [lo, hi]: readonly [number, number]) => t >= lo && t <= hi;

/* ---------- Dates (all YYYY-MM-DD, compared as strings, formatted in UTC so no time zone shifts a day) ---------- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parts = (s: string) => s.split('-').map(Number) as [number, number, number];
function validDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const dayNumber = (s: string) => { const [y, m, d] = parts(s); return Date.UTC(y, m - 1, d) / 86400000; };
const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DATE_FMT_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDate = (s: string) => { const [y, m, d] = parts(s); return DATE_FMT.format(new Date(Date.UTC(y, m - 1, d))); };
const fmtDay = (s: string) => { const [y, m, d] = parts(s); return DATE_FMT_SHORT.format(new Date(Date.UTC(y, m - 1, d))); };
const pad = (n: number) => String(n).padStart(2, '0');
/** A moment as a calendar date on the visitor's device (YYYY-MM-DD). */
function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
const grouped = (n: number) => Math.round(n).toLocaleString('en-US');

/* ---------- Application windows ---------- */

type AppKind = 'open' | 'upcoming' | 'closed' | 'unknown';
interface AppInfo { kind: AppKind; label: string; short: string; detail: string }

/**
 * Open / upcoming / closed from the visitor's clock. Where the race states a time of day (London, Chicago), the official
 * instant decides, so a window that closed at 16:00 GMT reads closed from then in every time zone; otherwise the listed
 * calendar dates and the visitor's own date decide. "Opens tomorrow" and "Closes today" count days on the visitor's calendar.
 */
function applicationInfo(s: Standard, today: string, now: number | null): AppInfo {
  const a = s.applications;
  const opens = a?.opens;
  const closes = a?.closes;
  if (!opens && !closes) return { kind: 'unknown', label: 'Dates not announced', short: 'Not announced', detail: '' };
  // Before the visitor's clock is read (the static HTML and the first render), the calendar dates decide, so both agree.
  const opensAt = now !== null && a?.opensAt ? Date.parse(a.opensAt) : null;
  const closesAt = now !== null && a?.closesAt ? Date.parse(a.closesAt) : null;
  const closed = closesAt !== null ? now! >= closesAt : Boolean(closes && today > closes);
  if (closed) return { kind: 'closed', label: 'Closed', short: 'Closed', detail: '' };
  const notYet = opensAt !== null ? now! < opensAt : Boolean(opens && today < opens);
  if (notYet) {
    const openDay = opensAt !== null ? localDate(opensAt) : opens!;
    const d = daysBetween(today, openDay);
    return { kind: 'upcoming', label: 'Upcoming', short: d <= 1 ? `Opens ${inDays(d)}` : `Opens ${fmtDay(openDay)}`, detail: `Opens ${inDays(d)}.` };
  }
  const closeDay = closesAt !== null ? localDate(closesAt) : closes;
  const d = closeDay ? daysBetween(today, closeDay) : null;
  return { kind: 'open', label: 'Open now', short: 'Open now', detail: d === null ? '' : `Closes ${inDays(d)}.` };
}
const APP_RANK: Record<AppKind, number> = { open: 0, upcoming: 1, unknown: 2, closed: 3 };

/* ---------- Qualifying windows ---------- */

type EndWhy = 'window' | 'applications' | 'registration';

/**
 * The last day a time can count for this edition. Proof goes in with the application, so an application deadline
 * earlier than the listed window end also ends the window (the same rule as evaluate() in lib/tools/qualifying.ts).
 */
function windowEnd(s: Standard): { end?: string; why: EndWhy } {
  if (s.key === 'boston' && !s.windowEnd) return { end: BOSTON_WINDOW_LATEST, why: 'registration' };
  const closes = s.applications?.closes;
  if (closes && (!s.windowEnd || closes < s.windowEnd)) return { end: closes, why: 'applications' };
  return { end: s.windowEnd, why: 'window' };
}

/** Why a race date falls outside this edition's window, as a phrase ("after applications close (Nov 12, 2026)"), or null if inside. */
function outsideReason(s: Standard, raceDate: string, closed = false): string | null {
  if (raceDate < s.windowStart) return `before this edition’s window opens (${fmtDate(s.windowStart)})`;
  const { end, why } = windowEnd(s);
  if (!end || raceDate <= end) return null;
  if (why === 'applications') return `after applications ${closed ? 'closed' : 'close'} (${fmtDate(end)}), so it cannot be submitted for this edition`;
  if (why === 'registration') return `after the ${yearOf(s)} window, which ends with ${end.slice(0, 4)} registration week (expected mid-September ${end.slice(0, 4)}, not yet announced)`;
  return `after this edition’s window closed (${fmtDate(end)})`;
}

/** evaluate() plus the window rules the shared table cannot express yet (Boston's end), with its notes reworded for the cards. */
function evaluateHere(s: Standard, input: QualifyInput): QualifyResult {
  const r = evaluate(s, input);
  const notes = r.notes.filter((n) => !n.startsWith('Applications for this edition close'));
  const outside = (r.status === 'meets' || r.status === 'misses') && outsideReason(s, input.raceDate) !== null;
  return { ...r, notes, status: outside ? 'outside-window' : r.status };
}

/** The course net drop exactly as the visitor typed it. Boston's index uses the B.A.A.'s bounds for that unit (feet or its own metric bounds). */
interface Drop { value: number; unit: 'ft' | 'm'; metres: number }
const bostonIndexFor = (d: Drop) => (d.unit === 'm' ? bostonDownhillIndexMetres(d.value) : bostonDownhillIndex(d.value));
/** The drop as typed, never re-rounded across a B.A.A. bound: "914.2 m", "2,999 ft". */
const fmtDrop = (d: Drop) => `${d.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${d.unit}`;
/** The bounds in the unit the visitor typed, as the B.A.A. publishes them. */
const BOSTON_BOUNDS = { ft: ['1,500 ft', '3,000 ft', '6,000 ft'], m: ['457.2 m', '914.2 m', '1,828.6 m'] } as const;

/** A course the race does not accept at all: Boston at 6,000 ft (1,828.6 m) or more, or more than a race's largest net drop (Sydney 457 m). */
function courseRejected(s: Standard, drop?: Drop): boolean {
  if (drop === undefined) return false;
  if (s.key === 'boston') return bostonIndexFor(drop) === null;
  return s.maxNetDropM !== undefined && drop.metres > s.maxNetDropM;
}

/* ---------- Verdicts ---------- */

type Tone = 'good' | 'bad' | 'warn' | 'muted';
interface Verdict { tone: Tone; label: string; short: string; route?: string; reason?: string }
const GLYPH: Record<Tone, string> = { good: '✓', bad: '✕', warn: '!', muted: '–' };

function verdict(r: QualifyResult, opts: { uk: boolean; nyrrGuaranteed: boolean; courseOut: boolean }): Verdict {
  const key = r.standard.key;
  switch (r.status) {
    case 'not-eligible':
      return !r.band ? { tone: 'muted', label: 'No age group', short: 'No age group', reason: r.notes[0] }
        : opts.courseOut ? { tone: 'muted', label: 'Course not accepted', short: 'Course drop', reason: r.notes[0] }
        : { tone: 'muted', label: 'Not eligible', short: 'Not eligible', reason: r.notes[0] };
    case 'no-category':
      return { tone: 'muted', label: 'No non-binary category', short: 'No category', reason: r.standard.nonbinaryNote };
    case 'outside-window':
      return { tone: 'warn', label: 'Outside the qualifying window', short: 'Outside window' };
    case 'misses':
      return { tone: 'bad', label: 'Misses the standard', short: 'Misses' };
    default: {
      // It meets the time, but Good For Age is for UK residents: the headline counts it only once "I live in the UK" is
      // ticked, and the row says both.
      if (key === 'london' && !opts.uk) return { tone: 'warn', label: 'Meets the time · UK residents only', short: 'Meets the time · UK residents only', route: 'Good For Age is for UK residents. If you live in the UK, tick it under “Course and entry details”.' };
      const route: Record<string, string> = {
        boston: 'You can apply. Acceptance depends on the cut-off.',
        nyc: opts.nyrrGuaranteed ? 'Guaranteed entry: a time from the 2026 TCS New York City Marathon.' : 'Enters the capped pool, fastest first.',
        london: 'Places go fastest first, relative to the standard.',
        chicago: CHICAGO_ROUTE,
        berlin: 'Not guaranteed: proof is reviewed.',
        sydney: 'Not guaranteed: places go fastest first.',
      };
      return { tone: 'good', label: 'Meets the standard', short: 'Meets', route: route[key] };
    }
  }
}

/* ---------- Text helpers ---------- */

function ageText(s: Standard, r: QualifyResult, birth: string, raceDate: string): { value: string; rule: string } {
  const value = r.age === null ? '—' : String(r.age);
  if (s.ageRule === 'race-day') return { value, rule: `Age on race day, ${fmtDate(s.ageDate!)}` };
  if (s.ageRule === 'time-run') return { value, rule: `Age on the day you ran it, ${fmtDate(raceDate)}` };
  return { value, rule: `Age reached in ${s.ageYear}: Berlin bands go by birth year (born ${birth.slice(0, 4)})` };
}

function bandText(s: Standard, b: Band, division: Division): string {
  if (s.ageRule === 'birth-year') {
    const to = s.ageYear! - b.min;
    return b.max >= 120 ? `${DIVISION_WORD[division]}, born ${to} or earlier` : `${DIVISION_WORD[division]}, born ${s.ageYear! - b.max}–${to}`;
  }
  return `${DIVISION_WORD[division]} ${b.max >= 120 ? `${b.min}+` : `${b.min}–${b.max}`}`;
}

const marginWord = (m: number) => (m > 0 ? 'under' : m < 0 ? 'over' : 'exactly on');
/** A margin in words, never a sign ("14:00 under", "3:00 over"): elsewhere on the site + means slower or behind. */
const marginAmount = (m: number) => formatDuration(Math.abs(Math.round(m)));
const marginText = (m: number) => (Math.round(m) === 0 ? 'exactly on' : `${marginAmount(m)} ${marginWord(m)}`);
const fmtTime = (s: number) => formatDuration(s, true);
const yearOf = (s: Standard) => s.edition.slice(0, 4);

/** "cleared 3 of the last 4 (2024–2027)": descriptive, never a forecast. */
function cutoffSummary(margin: number) {
  const cleared = clearedCutoffs(margin);
  const last4 = BOSTON_CUTOFFS.slice(-4);
  const recent = cleared.filter((c) => c.year >= last4[0].year).length;
  return { recent, all: cleared.length, total: BOSTON_CUTOFFS.length, span: `${last4[0].year}–${last4[last4.length - 1].year}` };
}

/* ---------- Main component ---------- */

interface Item { s: Standard; r: QualifyResult; v: Verdict; app: AppInfo; courseOut: boolean }

/** The value once it has stopped changing for `ms`, so a screen reader hears a result, not every keystroke. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return settled;
}

export default function QualifyingChecker() {
  const { units } = useUnits();
  const [q, setQ, queryReady, fromUrl] = useQueryState(DEFAULTS);
  const ids = useId();
  // The visitor's clock and date, read after mount so the static HTML and the first render agree (until then, VERIFIED_AT).
  const [now, setNow] = useState<number | null>(null);
  const today = useMemo(() => (now === null ? VERIFIED_AT : localDate(now)), [now]);
  const [birth, setBirth] = useState(EXAMPLE_BIRTH);
  const [example, setExample] = useState(true);
  const [remember, setRemember] = useState(false);
  const [dropText, setDropText] = useState('');
  const [dropUnitChoice, setDropUnit] = useState<'ft' | 'm' | null>(null);
  const [nyrr, setNyrr] = useState(false);
  const [uk, setUk] = useState(false);
  const [storageRead, setStorageRead] = useState(false);
  const [timeFocused, setTimeFocused] = useState(false);
  const [interacted, setInteracted] = useState(false);
  // Inputs the visitor has set on this page; with the keys their link supplied, these decide which values are still examples.
  const [changed, setChanged] = useState<Record<'t' | 'div' | 'race' | 'more', boolean>>({ t: false, div: false, race: false, more: false });
  const mark = (key: keyof typeof changed) => setChanged((c) => (c[key] ? c : { ...c, [key]: true }));

  // The visitor's clock and any remembered birth date.
  useEffect(() => {
    setNow(Date.now());
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && validDate(stored)) { setBirth(stored); setExample(false); setRemember(true); }
    } catch { /* storage unavailable: nothing remembered */ }
    setStorageRead(true);
  }, []);
  // Fine print belongs on paper: open every race and its "Rules and fine print" while printing, then put them back.
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>('.qualifying-race:not([open]), .qualifying-fine:not([open])')];
      opened.forEach((d) => { d.open = true; });
    };
    const after = () => { opened.forEach((d) => { d.open = false; }); opened = []; };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  // Write or forget only after the stored value has been read, and only when the visitor asked to be remembered.
  useEffect(() => {
    if (!storageRead) return;
    try {
      if (remember && !example && validDate(birth)) window.localStorage.setItem(STORAGE_KEY, birth);
      else if (!remember) window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable */ }
  }, [storageRead, remember, birth, example]);

  // A shared link may carry "div=m" or an unknown code: settle it on one division so the pressed button and the results agree.
  // An unknown code falls back to the example division, which then still counts as an example.
  const divEntry = DIVISIONS.find((d) => d.value === q.div.toUpperCase()) ?? DIVISIONS[1];
  const [divFallback, setDivFallback] = useState(false);
  useEffect(() => {
    if (!queryReady || q.div === divEntry.value) return;
    if (!DIVISIONS.some((d) => d.value === q.div.toUpperCase())) setDivFallback(true);
    setQ({ div: divEntry.value });
  }, [queryReady, q.div, divEntry.value, setQ]);
  const division = divEntry.division;
  const raceDate = q.race;
  const setRaceDate = (v: string) => { mark('race'); setQ({ race: v }); };
  const seconds = q.t ? parseDuration(q.t, 'race') : null;
  const dropUnit = dropUnitChoice ?? (units === 'mi' ? 'ft' : 'm');
  const dropNumber = dropText.trim() === '' ? null : Number(dropText.replace(/,/g, ''));
  const dropValid = dropNumber === null || Number.isFinite(dropNumber);
  // An unreadable drop is shown as an error on its own field; the results carry on without it.
  const drop: Drop | undefined = useMemo(() => (dropNumber !== null && Number.isFinite(dropNumber)
    ? { value: dropNumber, unit: dropUnit, metres: dropUnit === 'm' ? dropNumber : dropNumber * METRES_PER_FOOT } : undefined), [dropNumber, dropUnit]);

  const birthOk = validDate(birth);
  const raceOk = validDate(raceDate);
  const tooFast = seconds !== null && seconds < 7200;
  // While the time field has focus, keep showing the last complete result: "3:" or "3" (3 minutes) on the way to "3:29" should not blank the page.
  const usable = seconds !== null && !tooFast ? seconds : null;
  const [held, setHeld] = useState<number | null>(null);
  useEffect(() => { if (usable !== null) setHeld(usable); }, [usable]);
  const shown = usable ?? (timeFocused ? held : null);
  // While the visitor is still typing ("3" reads as 3 minutes on the way to "3:29"), hold the error until they leave the field.
  const timeError = tooFast && !timeFocused ? 'Under 2:00:00 is faster than the marathon world record. Check the time.' : null;
  const orderError = birthOk && raceOk && birth >= raceDate ? 'The date of birth must be before the race date.' : null;
  const ready = shown !== null && birthOk && raceOk && !orderError;
  // NYRR guaranteed entry needs a time from the one NYRR marathon in the window; any other date enters the pool.
  const nyrrGuaranteed = nyrr && raceDate === NYRR_MARATHON_DATE;

  const items: Item[] = useMemo(() => {
    if (!ready) return [];
    const input: QualifyInput = { birth, division, seconds: shown!, raceDate, nyrr, ukResident: uk,
      ...(drop ? (drop.unit === 'm' ? { dropMetres: drop.value } : { dropFeet: drop.value }) : {}) };
    return STANDARDS
      .map((s, i) => {
        const r = evaluateHere(s, input);
        const courseOut = courseRejected(s, drop);
        return { s, r, v: verdict(r, { uk, nyrrGuaranteed, courseOut }), app: applicationInfo(s, today, now), courseOut, i };
      })
      .sort((a, b) => {
        const rank = APP_RANK[a.app.kind] - APP_RANK[b.app.kind];
        if (rank) return rank;
        if (a.app.kind === 'open') return (a.s.applications?.closes ?? '9999').localeCompare(b.s.applications?.closes ?? '9999') || a.i - b.i;
        if (a.app.kind === 'upcoming') return (a.s.applications?.opens ?? '').localeCompare(b.s.applications?.opens ?? '') || a.i - b.i;
        return a.i - b.i;
      })
      .map(({ s, r, v, app, courseOut }) => ({ s, r, v, app, courseOut }));
  }, [ready, birth, division, shown, raceDate, drop, nyrr, nyrrGuaranteed, uk, today, now]);

  // A UK-only standard counts once the visitor says they live in the UK (its row says so either way).
  const meets = items.filter((it) => it.r.status === 'meets' && (uk || it.s.key !== 'london')).length;
  const boston = items.find((it) => it.s.key === 'boston');
  const planned = raceOk && raceDate > today;
  const extras = [drop ? `${fmtDrop(drop)} drop` : !dropValid ? 'check the drop' : null, nyrr ? 'NYC Marathon 2026' : null, uk ? 'UK resident' : null].filter(Boolean);
  const headline = meets === items.length ? `Meets all ${items.length} time standards` : meets === 0 ? `Meets none of the ${items.length} time standards` : `Meets ${meets} of ${items.length} time standards`;
  const emptyMessage = shown === null && timeFocused ? 'Keep typing the chip time: h:mm:ss, e.g. 3:29:00.'
    : seconds === null ? 'Enter your chip time to check it against six marathons’ standards.'
    : tooFast ? 'Check the chip time.'
    : !raceOk ? 'Enter the race date: each race only counts times from its own window.'
    : !birthOk ? 'Enter your date of birth: each race works out your age group differently.'
    : orderError ?? '';
  // One short, always-mounted status line for screen readers, sent once typing settles and only after the visitor changes something.
  const status = ready ? `${headline}.${boston && boston.r.margin !== null ? ` Boston ${yearOf(boston.s)}: ${marginText(boston.r.margin)} the standard.` : ''}` : emptyMessage;
  const settledStatus = useSettled(interacted ? status : '', 600);

  // Which inputs are still the example runner's. The birth date never travels in a link, so it stays an example until entered here.
  const exampleTime = !fromUrl.has('t') && !changed.t;
  const exampleDiv = !changed.div && (!fromUrl.has('div') || divFallback);
  const exampleRace = !fromUrl.has('race') && !changed.race;
  const allExample = exampleTime && exampleDiv && exampleRace && example && !changed.more;
  const stillExample = [
    exampleTime && shown !== null ? `time (${fmtTime(shown)})` : null,
    exampleDiv ? `division (${DIVISION_WORD[division]})` : null,
    exampleRace && raceOk ? `race date (${fmtDate(raceDate)})` : null,
    example ? `date of birth (${fmtDate(EXAMPLE_BIRTH)})` : null,
  ].filter((x): x is string => x !== null);
  const exampleNote = !ready ? null
    // Every input the example's: the card's kicker says "Example", and the inputs above show it, so no paragraph repeats
    // them. Only a partly typed example names what is still the example's (the date of birth sets every age group).
    : allExample ? null
    : stillExample.length ? <>The {listWords(stillExample)} {stillExample.length > 1 ? 'are still examples' : 'is still the example'}. Enter yours{example ? ': each race works out your age group differently' : ''}.</>
    : null;
  // Links to the pace band name the division only when the visitor chose it (from the link or here).
  const bandGender = !exampleDiv && division !== 'nonbinary' ? division : null;

  return (
    <div className="qualifying">
      <p className="sr-only" role="status">{settledStatus}</p>
      <div className="tool-workspace">
        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Qualifying checker inputs"
          onChangeCapture={() => setInteracted(true)} onClickCapture={(e) => { if ((e.target as HTMLElement).closest('button')) setInteracted(true); }}>
          <h2>Your marathon</h2>
          <div className="qualifying-time" onFocus={() => setTimeFocused(true)} onBlur={() => setTimeFocused(false)}>
            <DurationField label="Chip (net) time" large value={seconds} placeholder="3:29:00" error={timeError}
              onChange={(s) => { mark('t'); setQ({ t: s === null ? '' : formatDuration(s, true) }); }} hint="h:mm:ss, e.g. 3:29:00 or 3:29." />
          </div>
          <div className="tool-field">
            {/* Men, Women, Non-binary say what they are: the group's name is for screen readers. */}
            {/* Left out of session replays: the division is the visitor's gender. */}
            <div className="ph-no-capture"><Choice label="Division" value={divEntry.value} onChange={(v) => { mark('div'); setQ({ div: v }); }} options={DIVISIONS.map(({ value, label }) => ({ value, label }))} /></div>
          </div>
          {/* The two dates side by side, their notes under both, so the answer starts sooner on a phone. */}
          <div className="qualifying-dates">
            <div className="tool-field">
              <label htmlFor={`${ids}-race`}>Race date</label>
              <input id={`${ids}-race`} type="date" className="qualifying-date" value={raceOk ? raceDate : ''} min="2024-01-01" max="2028-12-31"
                aria-invalid={!raceOk || undefined} aria-describedby={`${ids}-race-hint`} onChange={(e) => setRaceDate(e.target.value)} />
            </div>
            <div className="tool-field">
              <label htmlFor={`${ids}-birth`}>Date of birth</label>
              <input id={`${ids}-birth`} type="date" className="qualifying-date" value={birth} min="1900-01-01" max={today} autoComplete="bday"
                aria-invalid={(!birthOk || Boolean(orderError)) || undefined} aria-describedby={`${ids}-birth-hint`}
                onChange={(e) => { setBirth(e.target.value); setExample(false); }} />
            </div>
            {/* "The day you ran it" goes without saying on screen; a planned race or a missing date is said. */}
            <p className={`tool-field-hint${raceOk ? '' : ' is-error'}${raceOk && !planned ? ' sr-only' : ''}`} id={`${ids}-race-hint`}>
              {raceOk ? (planned ? 'A future race date checks a planned race against the current windows.' : 'The day you ran it.') : 'Enter the race date.'}
            </p>
            {/* A missing or impossible date is said under the fields; otherwise the privacy note sits under "Remember", as
                its second line, so the answer starts sooner on a phone. */}
            {!birthOk || orderError ? (
              <p className="tool-field-hint is-error" id={`${ids}-birth-hint`}>
                {!birthOk ? 'Enter your date of birth: each race works out your age group differently.' : orderError}
              </p>
            ) : null}
            <label className="tool-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} aria-describedby={`${ids}-birth-note`} />
              <span>Remember my date of birth on this device</span>
            </label>
            {birthOk && !orderError ? <p className="tool-field-hint qualifying-birth-note" id={`${ids}-birth-hint`}><span id={`${ids}-birth-note`}>It never goes into links or analytics.</span></p> : null}
          </div>

          <details className="qualifying-more">
            <summary>
              Course and entry details
              <span className="sr-only">, </span>
              {extras.length ? <span className="qualifying-summary-value">{extras.join(' · ')}</span> : <span className="qualifying-summary-hint">optional</span>}
            </summary>
            <div className="qualifying-more-body">
              <div className="tool-field">
                <label htmlFor={`${ids}-drop`}>Course net drop (start minus finish elevation)</label>
                <div className="qualifying-drop">
                  <input id={`${ids}-drop`} inputMode="decimal" autoComplete="off" placeholder="0" value={dropText}
                    aria-invalid={!dropValid || undefined} aria-describedby={`${ids}-drop-hint`}
                    onChange={(e) => {
                      // Fix the unit with the first keystroke, so switching the site's units later never turns feet into metres.
                      if (dropUnitChoice === null) setDropUnit(dropUnit);
                      mark('more');
                      setDropText(e.target.value);
                    }} />
                  <Choice label="Drop unit" small value={dropUnit} onChange={(v) => { mark('more'); setDropUnit(v); }} options={[{ value: 'ft', label: 'ft' }, { value: 'm', label: 'm' }]} />
                </div>
                <p className={`tool-field-hint${dropValid ? '' : ' is-error'}`} id={`${ids}-drop-hint`}>
                  {!dropValid ? 'Type a number, e.g. 1650. Until then the results leave the drop out.' : drop ? dropNote(drop)
                    : `Boston adds 5:00 from ${BOSTON_BOUNDS[dropUnit][0]} and 10:00 from ${BOSTON_BOUNDS[dropUnit][1]}, and does not accept ${BOSTON_BOUNDS[dropUnit][2]} or more.${SYDNEY_MAX_DROP_M ? ` Sydney accepts at most ${grouped(SYDNEY_MAX_DROP_M)} m.` : ''}`}
                </p>
              </div>
              <div className="tool-field">
                <label className="tool-check">
                  <input type="checkbox" checked={nyrr} aria-describedby={`${ids}-nyrr-hint`} onChange={(e) => {
                    mark('more');
                    setNyrr(e.target.checked);
                    // The box says which race the time is from, so the race date follows it.
                    if (e.target.checked && NYRR_MARATHON_DATE && raceDate !== NYRR_MARATHON_DATE) setRaceDate(NYRR_MARATHON_DATE);
                  }} />
                  <span>The race is the 2026 TCS New York City Marathon{NYRR_MARATHON_DATE ? ` (${fmtDate(NYRR_MARATHON_DATE)})` : ''}</span>
                </label>
                <p className="tool-field-hint" id={`${ids}-nyrr-hint`}>For NYRR guaranteed entry. Ticking it sets the race date.</p>
              </div>
              <label className="tool-check">
                <input type="checkbox" checked={uk} onChange={(e) => { mark('more'); setUk(e.target.checked); }} />
                <span>I live in the UK (London Good For Age)</span>
              </label>
            </div>
          </details>
        </form>

        <div className="tool-results">
          {ready ? (
            <>
              {exampleNote ? <ExampleNote>{exampleNote}</ExampleNote> : null}
              <section className="tool-reading night qualifying-headline" aria-labelledby={`${ids}-headline`}>
                <div className="tool-reading-head">
                  {/* One line at a phone's width: the division and the time (the race date is in the form above). */}
                  <p className="tool-reading-kicker">{allExample ? 'Example · ' : ''}{DIVISIONS.find((d) => d.division === division)!.label} · {fmtTime(shown!)}</p>
                  <h2 className="tool-reading-figure" id={`${ids}-headline`}>
                    {meets === items.length ? `Meets all ${items.length}` : `Meets ${meets} of ${items.length}`}
                    <small>{boston ? <BostonLine it={boston} raceDate={raceDate} /> : 'time standards'}</small>
                  </h2>
                </div>
                <p className="qualifying-checked"><EvidenceTag kind="official" /><span>Checked <time dateTime={VERIFIED_AT}>{fmtDate(VERIFIED_AT)}</time></span></p>
              </section>

              <RaceRows items={items} birth={birth} raceDate={raceDate} seconds={shown!} division={division} drop={drop}
                dropIgnored={!dropValid} nyrr={nyrr} nyrrGuaranteed={nyrrGuaranteed} uk={uk} units={units} gender={bandGender} named={boston?.s.key} />

              <p className="tool-note qualifying-share-note">The copied link carries your division, time and race date, never your date of birth.</p>
              <ShareBar />
            </>
          ) : (
            <p className="tool-empty">{emptyMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Whether a margin would have cleared each published pool cut-off, in words. Past years only, never a forecast. */
function poolSentence(margin: number, pools: { year: number; seconds: number }[]): string {
  const yes = pools.filter((p) => margin >= p.seconds).map((p) => String(p.year));
  const no = pools.filter((p) => margin < p.seconds).map((p) => String(p.year));
  if (!no.length) return pools.length === 1 ? 'would have been enough that year' : pools.length === 2 ? 'would have been enough in both years' : 'would have been enough in every one of those years';
  if (!yes.length) return pools.length === 1 ? 'would not have been enough that year' : pools.length === 2 ? 'would not have been enough in either year' : 'would not have been enough in any of those years';
  return `would have been enough for ${listWords(yes)} but not for ${listWords(no)}`;
}

/** "a, b and c". */
function listWords(xs: string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** What the drop does: Boston's index in the unit typed (the B.A.A.'s own bounds for each unit), and Sydney's limit. */
function dropNote(drop: Drop): string {
  const index = bostonIndexFor(drop);
  const boston = index === null ? 'Not accepted for Boston.' : index ? `Boston adds ${index / 60}:00.` : 'No Boston index.';
  const sydney = SYDNEY_MAX_DROP_M !== undefined && drop.metres > SYDNEY_MAX_DROP_M ? ` Over Sydney’s ${grouped(SYDNEY_MAX_DROP_M)} m limit.` : '';
  return `${drop.unit === 'ft' ? `${fmtDrop(drop)} (about ${grouped(drop.metres)} m): ` : `${fmtDrop(drop)}: `}${boston}${sydney}`;
}

function BostonLine({ it, raceDate }: { it: Item; raceDate: string }) {
  const { r } = it;
  if (r.margin === null) return <>Boston {yearOf(it.s)}: {(it.v.reason ?? it.v.label).replace(/\.$/, '')}.</>;
  const sum = cutoffSummary(r.margin);
  const lead = r.margin === 0 ? <>Boston {yearOf(it.s)}: exactly on the standard</> : <>Boston {yearOf(it.s)}: <b>{marginAmount(r.margin)}</b> {marginWord(r.margin)} the standard</>;
  if (r.status === 'outside-window') return <>{lead}, but the race date is {outsideReason(it.s, raceDate) ?? 'outside its window'}.</>;
  if (r.margin < 0) return <>{lead}.</>;
  return <>{lead}, enough for {sum.recent} of the last 4 <span className="nowrap">cut-offs</span> ({sum.span}).</>;
}

/* ---------- One row per race: its margin as a bar, opening to its rules ---------- */

function RaceRows({ items, named, ...rest }: { items: Item[]; named?: string } & Omit<Parameters<typeof RaceBody>[0], 'it'>) {
  const margins = items.map((it) => it.r.margin).filter((m): m is number => m !== null);
  const CAP = 30 * 60;
  const lo = Math.max(-CAP, Math.floor(Math.min(-300, ...margins) / 300) * 300);
  const hi = Math.min(CAP, Math.ceil(Math.max(300, ...margins) / 300) * 300);
  const span = hi - lo;
  const pct = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / span) * 100;
  return (
    <section className="qualifying-races" aria-label="Each race’s standard">
      {/* The two words meet at the zero line, wherever the margins put it. */}
      <p className="qualifying-races-axis" aria-hidden="true">
        <span className="qualifying-races-axis-track"><span style={{ right: `${100 - pct(0)}%` }}>← Over</span><span style={{ left: `${pct(0)}%` }}>Under →</span></span>
      </p>
      <ol className="qualifying-race-list">
        {items.map((it) => {
          const { s, r, v, app } = it;
          const m = r.margin;
          const clipped = m !== null && (m > hi || m < lo);
          return (
            <li key={s.key}>
              {/* The race the night card names is the one signal bar; every other race that meets is ink. */}
              <details className={`qualifying-race is-${v.tone}${s.key === named ? ' is-named' : ''}`} id={`qualifying-${s.key}`}>
                <summary>
                  <span className="qualifying-race-name"><b>{SHORT[s.key]} {yearOf(s)}</b><small className={`qualifying-app is-${app.kind}`}>{app.short}</small></span>
                  <span className="qualifying-race-track" aria-hidden="true">
                    <i className="qualifying-race-zero" style={{ left: `${pct(0)}%` }} />
                    {m !== null ? <i className={`qualifying-race-bar${m < 0 ? ' is-neg' : ''}${clipped ? ' is-clipped' : ''}`} style={{ left: `${Math.min(pct(0), pct(m))}%`, width: `${Math.max(0.6, Math.abs(pct(m) - pct(0)))}%` }} /> : null}
                  </span>
                  <span className="qualifying-race-value">
                    {/* The amount, then its direction in words (the bar carries it too): never a sign. */}
                    <b>{m !== null ? <>{marginAmount(m)}<span className="qualifying-race-word"> {Math.round(m) === 0 ? 'on' : marginWord(m)}</span></> : '—'}</b>
                    {m !== null ? <span className="sr-only"> the standard.</span> : null}
                    <small><span aria-hidden="true">{GLYPH[v.tone]}</span> {v.short.includes(' · ') ? v.short.split(' · ').map((part, k) => <Fragment key={k}>{k ? ' · ' : ''}<span className="nowrap">{part}</span></Fragment>) : v.short}</small>
                  </span>
                </summary>
                <RaceBody it={it} {...rest} />
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RaceBody({ it, birth, raceDate, seconds, division, drop, dropIgnored, nyrrGuaranteed, uk, units, gender }: {
  it: Item; birth: string; raceDate: string; seconds: number; division: Division; drop?: Drop;
  dropIgnored: boolean; nyrr: boolean; nyrrGuaranteed: boolean; uk: boolean; units: UnitSystem;
  /** The division the visitor chose, passed to the pace band's observed columns (none for non-binary or the example division). */
  gender: 'men' | 'women' | null;
}) {
  const { s, r, v, app } = it;
  const age = ageText(s, r, birth, raceDate);
  const outside = outsideReason(s, raceDate, app.kind === 'closed');
  const { end, why } = windowEnd(s);
  const index = s.key === 'boston' && drop ? bostonIndexFor(drop) : 0;
  const dropShown = drop ? fmtDrop(drop) : null;
  // The verdict line already says these (index, residency, which New York route); dates in notes read as on the rest of the row.
  const notes = r.notes
    .filter((n) => !n.startsWith('Downhill index') && !n.startsWith('London Good For Age places') && !n.startsWith('A non-NYRR') && n !== v.reason
      && !(v.route && n.startsWith('A time from the 2026 TCS New York City Marathon')))
    .map((n) => (s.nyrrMarathonDate ? n.replace(`(${s.nyrrMarathonDate})`, `(${fmtDate(s.nyrrMarathonDate)})`) : n));
  // The standard for this age and division, even when the course itself is not accepted (Boston at 6,000 ft or more).
  const limit = r.limit ?? (r.band ? (division === 'nonbinary' ? r.band.nonbinary ?? null : r.band[division]) : null);
  // What it would take, in chip time on this course: the standard less any downhill index (and a second for a strict "under").
  const needed = r.limit !== null && index !== null ? r.limit - (index ?? 0) - (s.comparison === 'strictly-under' ? 1 : 0) : null;
  const passesTime = r.margin !== null && (s.comparison === 'strictly-under' ? r.margin > 0 : r.margin >= 0);
  const extraNote = v.tone === 'muted' ? null
    : r.status === 'outside-window' ? `The time ${passesTime ? 'would meet' : 'would also miss'} the standard, but ${fmtDate(raceDate)} is ${outside ?? 'outside this edition’s window'}.`
    : null;
  const bostonUnsure = s.key === 'boston' && why === 'registration' && !outside && raceDate >= BOSTON_WINDOW_UNSURE_FROM;
  const usesDrop = s.key === 'boston' || s.maxNetDropM !== undefined;
  const pools = s.poolHistory ?? [];
  const myway = s.key === 'london' && r.age !== null ? [...LONDON_MYWAY_HALF].reverse().find(([min]) => r.age! >= min) : undefined;
  const champ = s.key === 'london' && division !== 'nonbinary' ? LONDON_CHAMPIONSHIP[division] : null;
  const fine = [...(s.extra ?? []), s.nonbinaryNote];
  if (s.key === 'london') {
    fine.push(`MyWay: if your only qualifying time is from the virtual TCS London Marathon MyWay, you also need an in-person half marathon run in the same window on a certified course${myway && division !== 'nonbinary' ? `, under ${formatDuration(division === 'men' ? myway[1] : myway[2])} for ${division} in your age band` : ''}.`);
    fine.push(`Championship entry (a separate route for members of a UK athletics body, open to non-residents): marathon under ${formatDuration(LONDON_CHAMPIONSHIP.men)} for men or ${formatDuration(LONDON_CHAMPIONSHIP.women)} for women, run in the same window; 1,200 places, fastest first; applications close 16:00 BST, ${fmtDate(LONDON_CHAMPIONSHIP.closes)}.`);
    fine.push('London publishes no acceptance cut-off.');
  }
  if (s.key === 'sydney') fine.unshift('Gun or net (chip) time is accepted. This checker uses the chip time you entered; a gun time is usually a little slower.');
  const timeHint = s.key === 'sydney' ? 'Chip (net) time; Sydney also accepts gun time' : 'Chip (net) time';
  // The time to aim for on this course: the standard less any downhill index, a second inside a strict "under". Its even
  // pace, and the pace band for it (whole minutes, the minute at or below), when the band takes that goal.
  const aim = needed !== null && v.tone !== 'muted' && !it.courseOut ? needed : null;
  const aimPace = aim !== null ? `${formatDuration(perUnit(aim / MARATHON_KM, units))}/${units}` : '';
  const aimMinutes = aim !== null ? Math.floor(aim / 60) : 0;
  const aimHref = `/tools/pace-band?goal=${Math.floor(aimMinutes / 60)}:${pad(aimMinutes % 60)}${gender ? `&g=${gender}` : ''}`;
  return (
    <div className="qualifying-race-body">
      <div className={`qualifying-verdict is-${v.tone}`}>
        <p className="qualifying-status"><span className="qualifying-glyph" aria-hidden="true">{GLYPH[v.tone]}</span>{v.label}{r.margin !== null ? <span className="qualifying-margin"> · {marginText(r.margin)}</span> : null}</p>
        {v.route || v.reason || extraNote || notes.length || bostonUnsure || (dropIgnored && usesDrop) ? (
          <ul className="qualifying-verdict-notes">
            {v.route ? <li>{v.route}</li> : null}
            {extraNote ? <li>{extraNote}</li> : null}
            {v.reason ? <li>{v.reason}</li> : null}
            {notes.map((n) => <li key={n}>{n}</li>)}
            {bostonUnsure ? <li>A time run in September {raceDate.slice(0, 4)} counts for {yearOf(s)} only if it is run before {raceDate.slice(0, 4)} registration week ends (expected mid-September; not yet announced).</li> : null}
            {dropIgnored && usesDrop ? <li>Course drop not applied: check the number typed under “Course and entry details”.</li> : null}
            {r.margin === 0 && !s.comparisonStated && v.tone !== 'muted' ? (
              <li>Exactly on the standard. {ORGANISER[s.key] ?? 'The race'} does not say whether an equal time qualifies.{s.key === 'boston' ? ' Acceptance goes to those furthest under.' : ''}</li>
            ) : null}
            {s.key === 'london' && champ !== null && seconds < champ && !outside ? (
              <li>Also under the Championship standard ({formatDuration(champ)}), a separate route for UK athletics club members{uk ? '' : ', open to non-residents'}. Applications close {fmtDate(LONDON_CHAMPIONSHIP.closes)}.</li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <dl className="tool-ledger qualifying-facts">
        <div><dt>Standard</dt><dd>{limit !== null && r.band ? fmtTime(limit) : '—'}</dd>
          <dd className="tool-ledger-note">{limit !== null && r.band ? <>{bandText(s, r.band, division)}{division === 'nonbinary' && r.band.nonbinary === r.band.women ? ' (equal to the women’s)' : ''} · {comparisonText(s)}</> : v.reason ?? 'No standard applies.'}</dd></div>
        <div><dt>{s.key === 'boston' ? 'Time counted' : 'Your time'}</dt>
          <dd>{s.key === 'boston' && index === null ? '—' : s.key === 'boston' && index ? fmtTime(r.counted) : fmtTime(seconds)}</dd>
          <dd className="tool-ledger-note">{s.key === 'boston' && index === null ? `Not counted: courses dropping ${BOSTON_BOUNDS[drop!.unit][2]} or more are not accepted (this one: ${dropShown}).`
            : s.key === 'boston' && index ? `${fmtTime(seconds)} chip + ${index / 60}:00 downhill index for a ${dropShown} net drop`
              : s.key === 'boston' ? (drop ? `Chip time; no downhill index for a ${dropShown} drop (under ${BOSTON_BOUNDS[drop.unit][0]})` : 'Chip time; add a course drop for the downhill index') : timeHint}</dd></div>
        {aim !== null ? <div><dt>Aim for</dt><dd>{fmtTime(aim)}</dd>
          <dd className="tool-ledger-note">{aimPace} even pace{index ? `, with the ${index / 60}:00 downhill index` : ''}{s.comparison === 'strictly-under' ? ', a second inside the standard' : ''}{within(aim, BAND_RANGE) ? <> · <Link href={aimHref}>Pace band for it</Link></> : null}</dd></div> : null}
        <div><dt>Age used</dt><dd>{age.value}</dd><dd className="tool-ledger-note">{age.rule}</dd></div>
        <div><dt>Window</dt><dd className={outside ? 'is-signal' : undefined}>{outside ? 'Outside' : 'Inside'}</dd>
          <dd className="tool-ledger-note">{s.windowNote}{why === 'applications' && end ? ` The time must be run by ${fmtDate(end)}, when applications ${app.kind === 'closed' ? 'closed' : 'close'}.` : ''}{why === 'registration' ? ` ${end!.slice(0, 4)} registration week has not been dated; it is usually mid-September.` : ''}</dd></div>
        <div><dt>Applications</dt><dd>{app.label}</dd>
          <dd className="tool-ledger-note">{app.detail ? `${app.detail} ` : ''}{s.applications?.note ?? 'Application dates for this edition are not listed yet.'}{app.kind === 'closed' && s.key === 'sydney' ? ' Shown for reference.' : ''}</dd></div>
        <div><dt>Entry</dt><dd className="tool-ledger-note qualifying-entry">{s.entry}</dd></div>
      </dl>

      {s.key === 'boston' ? <BostonHistory margin={r.margin} outside={r.status === 'outside-window'} /> : null}
      {pools.length && r.margin !== null && r.margin >= 0 && !nyrrGuaranteed ? (
        <p className="tool-note qualifying-pool">
          <strong>The capped pool.</strong> NYRR reported how far under their standard non-NYRR qualifiers had to be: {listWords(pools.map((p) => `${formatDuration(p.seconds)} for ${p.year} (${p.accepted} accepted)`))}.
          {' '}A margin of {marginAmount(r.margin)} {poolSentence(r.margin, pools)}. Past years, not a forecast.
        </p>
      ) : null}

      <details className="tool-more qualifying-fine">
        <summary>Rules and fine print<span className="sr-only">: {SHORT[s.key]}</span></summary>
        <div className="tool-more-body"><ul>{fine.map((f) => <li key={f}>{f}</li>)}</ul></div>
      </details>

      <p className="qualifying-sources">
        {s.sources[0] ? <a className="no-print" href={s.sources[0].url} rel="noopener noreferrer">Official qualifying page<span aria-hidden="true">{' '}↗</span></a> : null}
        <Link className="no-print" href={`/tools/qualifying/${s.key}`}>Every {SHORT[s.key] ?? s.race} age group</Link>
      </p>
    </div>
  );
}

/* ---------- Boston: every past cut-off against this margin ---------- */

function BostonHistory({ margin, outside }: { margin: number | null; outside: boolean }) {
  const random = BOSTON_STANDARD.randomSelection;
  const draw = random ? BOSTON_CUTOFFS.find((c) => c.year === random.year) : undefined;
  const share = random && draw ? random.drawn / (draw.notAccepted + random.drawn) : null;
  const sum = margin !== null ? cutoffSummary(margin) : null;
  return (
    <section className="qualifying-boston" aria-labelledby="qualifying-boston-history">
      <h3 id="qualifying-boston-history">
        {margin === null ? 'Every past cut-off'
          : margin < 0 ? <>A time {marginAmount(margin)} over the standard could not apply in any year.</>
            : <>Your <b>{marginAmount(margin)}</b> margin would have cleared {sum!.all} of {sum!.total} <span className="nowrap">cut-offs</span> since {BOSTON_CUTOFFS[0].year}.</>}
      </h3>
      {outside && margin !== null && margin >= 0 ? <p className="tool-note">This compares the margin only: the race date is outside the window.</p> : null}
      <CutoffChart margin={margin} />
      <Values id="qualifying-boston-values" caption="Boston cut-offs: how far under their standard applicants had to be, and how many qualifiers were turned away" count={BOSTON_CUTOFFS.length}>
        <table className="table">
          <thead><tr><th scope="col">Race</th><th scope="col">Cut-off</th><th scope="col">Turned away</th><th scope="col">Cleared</th></tr></thead>
          <tbody>
            {[...BOSTON_CUTOFFS].reverse().map((c) => (
              <tr key={c.year}>
                <th scope="row">{c.year}{c.note ? <small> {c.note}</small> : null}</th>
                <td>{formatDuration(c.cutoff)}</td>
                <td>{grouped(c.notAccepted)}</td>
                <td>{margin !== null && margin >= c.cutoff ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Values>
      {random && draw && share !== null ? (
        <p className="tool-note"><strong>{random.year} random selection.</strong> The B.A.A. also drew about {grouped(random.drawn)} qualifiers at random from those who missed the {formatDuration(draw.cutoff)} cut-off: about {Math.round(share * 100)}% of that group.</p>
      ) : null}
      <p className="tool-note">Past cut-offs, not a forecast: the B.A.A. does not predict them, and neither does Pace Notes.</p>
    </section>
  );
}

/**
 * Every Boston cut-off as a lollipop by year, the margin entered as a line across them: the cut-offs it clears in ink,
 * the rest quiet. Drawn in pixels at the measured width, so labels stay 12 px.
 */
function CutoffChart({ margin }: { margin: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  // Drawn only while its race is open (and for printing), so it is always drawn at the width it is shown at.
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const details = ref.current?.closest('details');
    if (!details) return undefined;
    const sync = () => setShown(details.open);
    const print = () => flushSync(() => setShown(true));
    sync();
    details.addEventListener('toggle', sync);
    window.addEventListener('beforeprint', print);
    window.addEventListener('afterprint', sync);
    return () => { details.removeEventListener('toggle', sync); window.removeEventListener('beforeprint', print); window.removeEventListener('afterprint', sync); };
  }, []);
  const narrow = width < 520;
  const H = narrow ? 180 : 210;
  const m = { l: 40, r: 8, t: 22, b: 24 };
  const rows = BOSTON_CUTOFFS;
  const maxCut = Math.max(...rows.map((c) => c.cutoff));
  const yMax = margin !== null && margin > maxCut && margin <= 600 ? Math.ceil((margin + 30) / 120) * 120 : Math.ceil((maxCut + 10) / 120) * 120;
  const plotW = Math.max(60, width - m.l - m.r);
  const plotH = H - m.t - m.b;
  const step = plotW / rows.length;
  const x = (i: number) => m.l + step * i + step / 2;
  const y = (v: number) => m.t + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += 120) ticks.push(t);
  const sum = margin !== null && margin >= 0 ? cutoffSummary(margin) : null;
  const label = `Boston Marathon cut-offs from ${rows[0].year} to ${rows[rows.length - 1].year}, from 0:00 to ${formatDuration(maxCut)} under the standard. `
    + (margin === null ? 'No margin to compare.' : margin < 0 ? `Your time is ${marginAmount(margin)} over the standard, so it clears none.` : `Your margin of ${marginAmount(margin)} would have cleared ${sum!.all} of ${sum!.total}, including ${sum!.recent} of the last 4 (${sum!.span}).`);
  const lineY = margin !== null && margin >= 0 ? y(margin) : null;
  const above = margin !== null && margin > yMax;
  // Every year that has room for its label (about 22 px for "’27", 34 px for "2027"), counted back from the latest.
  const yearEvery = Math.max(1, Math.ceil(((narrow ? 22 : 31) + 6) / step));
  return (
    <div className="qualifying-cutoff-chart" ref={ref} style={shown ? undefined : { height: H }}>
      {shown ? <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t} className="qualifying-grid">
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{formatDuration(t)}</text>
          </g>
        ))}
        {rows.map((c, i) => {
          const cleared = margin !== null && margin >= c.cutoff;
          return (
            <g key={c.year} className={`qualifying-lolly${cleared ? ' is-cleared' : ''}`}>
              <line x1={x(i)} x2={x(i)} y1={m.t + plotH} y2={y(c.cutoff)} />
              <circle cx={x(i)} cy={y(c.cutoff)} r={4.5} />
              {i % yearEvery === (rows.length - 1) % yearEvery ? <text x={x(i)} y={H - 6} textAnchor="middle">{narrow ? `’${String(c.year).slice(2)}` : c.year}</text> : null}
            </g>
          );
        })}
        <line className="qualifying-base" x1={m.l} x2={width - m.r} y1={m.t + plotH} y2={m.t + plotH} />
        {lineY !== null ? <line className="qualifying-margin-rule" x1={m.l} x2={width - m.r} y1={lineY} y2={lineY} /> : null}
        {lineY !== null ? (
          <text className="qualifying-margin-label" x={m.l + 4} y={Math.max(12, lineY - 7)}>{above ? `Your ${marginAmount(margin!)} is above every cut-off` : `Your ${marginAmount(margin!)}`}</text>
        ) : null}
      </svg> : null}
    </div>
  );
}
