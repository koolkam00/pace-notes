'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, EvidencePanel, ExampleNote, ShareBar } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import {
  BOSTON_CUTOFFS, STANDARDS, VERIFIED_AT, bostonDownhillIndex, bostonDownhillIndexMetres, clearedCutoffs, evaluate,
  type Band, type Division, type QualifyInput, type QualifyResult, type Standard,
} from '@/lib/tools/qualifying';
import { formatDuration, formatMargin, parseDuration } from '@/lib/tools/time';
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
/** Goals the pace band accepts (its even-pace band), and the whole-minute goals its observed columns and the course chooser cover. */
const BAND_RANGE = [90 * 60, 480 * 60] as const;
const OBSERVED_RANGE = [150 * 60, 390 * 60] as const;
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
      if (key === 'london' && !opts.uk) return { tone: 'warn', label: 'Meets the time · UK residents only', short: 'UK only', route: 'If you live in the UK, tick it under “Course and entry details”.' };
      const route: Record<string, string> = {
        boston: 'You can apply. Acceptance depends on the cut-off.',
        nyc: opts.nyrrGuaranteed ? 'Guaranteed entry: a time from the 2026 TCS New York City Marathon.' : 'Enters the capped pool, fastest first.',
        london: 'Places go fastest first, relative to the standard.',
        chicago: 'Guaranteed entry. There is no cut-off.',
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
  const [buffer, setBuffer] = useState(0);
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
  // Fine print belongs on paper: open every card's "Rules and fine print" while printing, then put them back.
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>('.qualifying-fine:not([open])')];
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

  const meets = items.filter((it) => it.r.status === 'meets').length;
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
  const status = ready ? `${headline}.${boston && boston.r.margin !== null ? ` Boston ${yearOf(boston.s)}: ${formatMargin(boston.r.margin)} ${marginWord(boston.r.margin)} the standard.` : ''}` : emptyMessage;
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
    : allExample ? <>An example runner: {DIVISION_WORD[division]}, {fmtTime(shown!)} on {fmtDate(raceDate)}, born {fmtDate(EXAMPLE_BIRTH)}. Enter yours; each race works out your age group its own way.</>
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
              onChange={(s) => { mark('t'); setQ({ t: s === null ? '' : formatDuration(s, true) }); }} hint="h:mm:ss, e.g. 3:29:00 or 3:29" />
          </div>
          <div className="tool-field">
            <span className="tool-label" aria-hidden="true">Division</span>
            <Choice label="Division" value={divEntry.value} onChange={(v) => { mark('div'); setQ({ div: v }); }} options={DIVISIONS.map(({ value, label }) => ({ value, label }))} />
          </div>
          <div className="tool-field">
            <label htmlFor={`${ids}-race`}>Race date</label>
            <div className="qualifying-date-row">
              <input id={`${ids}-race`} type="date" className="qualifying-date" value={raceOk ? raceDate : ''} min="2024-01-01" max="2028-12-31"
                aria-invalid={!raceOk || undefined} aria-describedby={`${ids}-race-hint`} onChange={(e) => setRaceDate(e.target.value)} />
              <button type="button" className="qualifying-link-button" onClick={() => setRaceDate(today)}>Today</button>
            </div>
            <p className={`tool-field-hint${raceOk ? '' : ' is-error'}`} id={`${ids}-race-hint`}>
              {raceOk ? (planned ? 'A future date checks a planned race against the current windows.' : 'The day you ran it. Each race counts times from its own window.') : 'Enter the race date.'}
            </p>
          </div>
          <div className="tool-field">
            <label htmlFor={`${ids}-birth`}>Date of birth</label>
            <input id={`${ids}-birth`} type="date" className="qualifying-date" value={birth} min="1900-01-01" max={today} autoComplete="bday"
              aria-invalid={(!birthOk || Boolean(orderError)) || undefined} aria-describedby={`${ids}-birth-hint`}
              onChange={(e) => { setBirth(e.target.value); setExample(false); }} />
            <p className={`tool-field-hint${birthOk && !orderError ? '' : ' is-error'}`} id={`${ids}-birth-hint`}>
              {!birthOk ? 'Enter your date of birth: each race works out your age group differently.'
                : orderError ?? (example ? `An example runner born ${fmtDate(EXAMPLE_BIRTH)}. Enter yours. ` : '')}
              {birthOk && !orderError ? 'It stays in this browser: never in the link or analytics.' : null}
            </p>
            <label className="tool-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember my date of birth on this device</span>
            </label>
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
                  {!dropValid ? 'Type a number, e.g. 1650. Until then the results leave the drop out. ' : drop ? <>{dropNote(drop)} </> : null}
                  For Boston’s <a href={BOSTON_STANDARD.sources[0].url} rel="noopener noreferrer">downhill index</a>: 1,500 ft (457.2 m) adds 5:00, 3,000 ft (914.2 m) adds 10:00, 6,000 ft (1,828.6 m) is not accepted. A drop in metres uses the B.A.A.’s own metric bounds.{SYDNEY_MAX_DROP_M ? ` Sydney accepts at most ${grouped(SYDNEY_MAX_DROP_M)} m.` : ''} The B.A.A. does not list affected races.
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
                <p className="tool-field-hint" id={`${ids}-nyrr-hint`}>
                  NYRR guaranteed entry needs a time from this race (ticking it sets the race date) or a listed NYRR half marathon, which this checker does not take.
                </p>
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
              <div className="tool-headline qualifying-headline">
                <div className="qualifying-head">
                  <span className="evidence-badge evidence-official">Official standards</span>
                  <p className="qualifying-kicker">
                    {DIVISIONS.find((d) => d.division === division)!.label} · {fmtTime(shown!)} · {planned ? 'planned for' : 'run'} {fmtDate(raceDate)}
                  </p>
                  <p className="qualifying-big">{headline}</p>
                  {boston ? <p className="qualifying-big-sub"><BostonLine it={boston} raceDate={raceDate} /></p> : null}
                </div>
                <Scoreboard items={items} />
              </div>

              {items.map((it) => (
                <RaceCard key={it.s.key} it={it} birth={birth} raceDate={raceDate} seconds={shown!} division={division} drop={drop}
                  dropIgnored={!dropValid} nyrr={nyrr} nyrrGuaranteed={nyrrGuaranteed} uk={uk} />
              ))}

              <TargetsPanel items={items} seconds={shown!} buffer={buffer} setBuffer={setBuffer} drop={drop} units={units} gender={bandGender} />

              <p className="tool-note qualifying-share-note">The copied link carries your division, time and race date. It leaves out the course and entry details, and whoever opens it enters their own date of birth.</p>
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
  const lead = <>Boston {yearOf(it.s)}: <b>{formatMargin(r.margin)}</b> {marginWord(r.margin)} the standard</>;
  if (r.status === 'outside-window') return <>{lead}, but the race date is {outsideReason(it.s, raceDate) ?? 'outside its window'}.</>;
  if (r.margin < 0) return <>{lead}.</>;
  return <>{lead}. That margin would have cleared {sum.recent} of the last 4 cut-offs ({sum.span}). Past cut-offs, not a forecast.</>;
}

/* ---------- Headline scoreboard: margin against each standard ---------- */

function Scoreboard({ items }: { items: Item[] }) {
  const margins = items.map((it) => it.r.margin).filter((m): m is number => m !== null);
  const CAP = 30 * 60;
  const lo = Math.max(-CAP, Math.floor(Math.min(-300, ...margins) / 300) * 300);
  const hi = Math.min(CAP, Math.ceil(Math.max(300, ...margins) / 300) * 300);
  const span = hi - lo;
  const step = span > 2400 ? 1200 : span > 1200 ? 600 : 300;
  const pct = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / span) * 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return (
    <div className="qualifying-board-wrap">
      <div className="qualifying-board-axis" aria-hidden="true">
        <span />
        <div className="qualifying-board-scale">
          {ticks.map((t) => <span key={t} style={{ left: `${pct(t)}%` }} className={t === 0 ? 'is-zero' : undefined}>{t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t) / 60}`}</span>)}
        </div>
        <span>min</span>
      </div>
      <ol className="qualifying-board">
        {items.map(({ s, r, v, app }) => {
          const m = r.margin;
          const clipped = m !== null && (m > hi || m < lo);
          return (
            <li key={s.key} className={`qualifying-board-row is-${v.tone}`}>
              <a className="qualifying-board-name" href={`#qualifying-${s.key}`}>
                <b>{SHORT[s.key]} {yearOf(s)}</b>
                <span className={`qualifying-board-app is-${app.kind}`}>{app.short}</span>
              </a>
              <div className="qualifying-board-track" aria-hidden="true">
                {ticks.map((t) => <i key={t} className={t === 0 ? 'is-zero' : undefined} style={{ left: `${pct(t)}%` }} />)}
                {m !== null ? (
                  <span className={`qualifying-board-bar${m < 0 ? ' is-neg' : ''}${clipped ? ' is-clipped' : ''}`}
                    style={{ left: `${Math.min(pct(0), pct(m))}%`, width: `${Math.abs(pct(m) - pct(0))}%` }} />
                ) : null}
              </div>
              <p className="qualifying-board-value">
                <b>{m !== null ? formatMargin(m) : '—'}</b>
                {m !== null ? <span className="sr-only"> {marginWord(m)} the standard.</span> : null}
                <span className="qualifying-board-status"><span aria-hidden="true">{GLYPH[v.tone]}</span> {v.short}</span>
              </p>
            </li>
          );
        })}
      </ol>
      <p className="qualifying-board-caption">Minutes under (+) or over (−) each standard. Bars stop at {CAP / 60} minutes. Tap a race for its rules.</p>
    </div>
  );
}

/* ---------- One card per race ---------- */

function RaceCard({ it, birth, raceDate, seconds, division, drop, dropIgnored, nyrr, nyrrGuaranteed, uk }: {
  it: Item; birth: string; raceDate: string; seconds: number; division: Division; drop?: Drop;
  dropIgnored: boolean; nyrr: boolean; nyrrGuaranteed: boolean; uk: boolean;
}) {
  const { s, r, v, app, courseOut } = it;
  const age = ageText(s, r, birth, raceDate);
  const outside = outsideReason(s, raceDate, app.kind === 'closed');
  const { end, why } = windowEnd(s);
  const index = s.key === 'boston' && drop ? bostonIndexFor(drop) : 0;
  const dropShown = drop ? fmtDrop(drop) : null;
  // The verdict line already says these (index, residency, which New York route); dates in notes read as on the rest of the card.
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
    : r.status === 'misses' && needed !== null ? `To meet it: ${fmtTime(needed)} or faster${index ? ' on this course' : ''}.`
    : r.status === 'outside-window' ? `The time ${passesTime ? 'would meet' : 'would also miss'} the standard, but ${fmtDate(raceDate)} is ${outside ?? 'outside this edition’s window'}.`
    : null;
  const bostonUnsure = s.key === 'boston' && why === 'registration' && !outside && raceDate >= BOSTON_WINDOW_UNSURE_FROM;
  const usesDrop = s.key === 'boston' || s.maxNetDropM !== undefined;
  const pools = s.poolHistory ?? [];
  const myway = s.key === 'london' && r.age !== null ? [...LONDON_MYWAY_HALF].reverse().find(([min]) => r.age! >= min) : undefined;
  const champ = s.key === 'london' && division !== 'nonbinary' ? LONDON_CHAMPIONSHIP[division] : null;
  const fine = [...(s.extra ?? []), s.nonbinaryNote];
  if (s.key === 'boston') fine.push('B.A.A. statements differ on how long the downhill index lasts: the June 2025 rule said at least two years; the September 2026 registration update says it may change before 2028 registration.');
  if (s.key === 'london') {
    fine.push(`MyWay: if your only qualifying time is from the virtual TCS London Marathon MyWay, you also need an in-person half marathon run in the same window on a certified course${myway && division !== 'nonbinary' ? `, under ${formatDuration(division === 'men' ? myway[1] : myway[2])} for ${division} in your age band` : ''}.`);
    fine.push(`Championship entry (a separate route for members of a UK athletics body, open to non-residents): marathon under ${formatDuration(LONDON_CHAMPIONSHIP.men)} for men or ${formatDuration(LONDON_CHAMPIONSHIP.women)} for women, run in the same window; 1,200 places, fastest first; applications close 16:00 BST, ${fmtDate(LONDON_CHAMPIONSHIP.closes)}.`);
    fine.push('London publishes no acceptance cut-off.');
  }
  if (s.key === 'sydney') fine.unshift('Gun or net (chip) time is accepted. This checker uses the chip time you entered; a gun time is usually a little slower.');
  const sources = s.key === 'london' ? [...s.sources, LONDON_CHAMPIONSHIP.source] : s.sources;
  const timeHint = s.key === 'sydney' ? 'Chip (net) time; Sydney also accepts gun time' : 'Chip (net) time';
  return (
    <EvidencePanel kind="official" id={`qualifying-${s.key}`} title={s.race} meta={<>Edition {s.edition}</>}>
      <span className={`qualifying-app is-${app.kind}`}>{app.label}</span>
      <div className="qualifying-card">
        <div className={`qualifying-verdict is-${v.tone}`}>
          <p className="qualifying-status"><span className="qualifying-glyph" aria-hidden="true">{GLYPH[v.tone]}</span>{v.label}</p>
          {r.margin !== null ? (
            <p className="qualifying-margin"><b>{formatMargin(r.margin)}</b> <span>{marginWord(r.margin)} the standard</span></p>
          ) : null}
          {v.route || v.reason || extraNote || notes.length || bostonUnsure || (dropIgnored && usesDrop) ? (
            <ul className="qualifying-verdict-notes">
              {v.route ? <li>{v.route}</li> : null}
              {extraNote ? <li>{extraNote}</li> : null}
              {v.reason ? <li>{v.reason}</li> : null}
              {notes.map((n) => <li key={n}>{n}</li>)}
              {bostonUnsure ? <li>A time run in September {raceDate.slice(0, 4)} counts for {yearOf(s)} only if it is run before {raceDate.slice(0, 4)} registration week ends (expected mid-September; not yet announced).</li> : null}
              {dropIgnored && usesDrop ? <li>Course drop not applied: check the number typed under “Course and entry details”.</li> : null}
              {r.margin === 0 && !s.comparisonStated && v.tone !== 'muted' ? (
                <li>Exactly on the standard. {ORGANISER[s.key] ?? 'The race'} does not say whether an equal time qualifies; the checker counts it as meeting the standard{s.key === 'boston' ? ', and acceptance goes to those furthest under' : ''}.</li>
              ) : null}
              {s.key === 'london' && champ !== null && seconds < champ && !outside ? (
                <li>Also under the Championship standard ({formatDuration(champ)}), a separate route for UK athletics club members{uk ? '' : ', open to non-residents'}. Applications close {fmtDate(LONDON_CHAMPIONSHIP.closes)}.</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <dl className="qualifying-facts">
          <div className="is-key"><dt>Age used</dt><dd><b>{age.value}</b><span>{age.rule}</span></dd></div>
          <div className="is-key">
            <dt>Standard</dt>
            <dd>
              {limit !== null && r.band ? <><b>{fmtTime(limit)}</b><span>{bandText(s, r.band, division)}{division === 'nonbinary' && r.band.nonbinary === r.band.women ? ' (equal to the women’s)' : ''} · {s.comparison === 'strictly-under' ? 'strictly under' : s.comparisonStated ? 'at or under' : 'at or under (assumed; not stated by the race)'}</span></>
                : <><b>—</b><span>{v.reason ?? 'No standard applies.'}</span></>}
            </dd>
          </div>
          <div className="is-key">
            <dt>{s.key === 'boston' ? 'Time counted' : 'Your time'}</dt>
            <dd>
              {s.key === 'boston' && index === null ? <><b>—</b><span>Not counted: courses dropping {BOSTON_BOUNDS[drop!.unit][2]} or more are not accepted (this one: {dropShown}).</span></>
                : s.key === 'boston' && index ? <><b>{fmtTime(r.counted)}</b><span>{fmtTime(seconds)} chip + {index / 60}:00 downhill index for a {dropShown} net drop</span></>
                : <><b>{fmtTime(seconds)}</b><span>{s.key === 'boston' ? (drop ? `Chip time; no downhill index for a ${dropShown} drop (under ${BOSTON_BOUNDS[drop.unit][0]})` : 'Chip time; add a course drop for the downhill index') : timeHint}</span></>}
            </dd>
          </div>
          <div className="is-half">
            <dt>Window</dt>
            <dd>
              <b className={outside ? 'is-out' : 'is-in'}><span aria-hidden="true">{outside ? '✕ ' : '✓ '}</span>{outside ? 'Outside' : 'Inside'}</b>
              <span>
                {s.windowNote}
                {why === 'applications' && end ? ` Proof goes in with the application, so the time must be run by ${fmtDate(end)}, when applications ${app.kind === 'closed' ? 'closed' : 'close'}.` : ''}
                {why === 'registration' ? ` ${end!.slice(0, 4)} registration week has not been dated; it is usually mid-September.` : ''}
              </span>
            </dd>
          </div>
          <div className="is-half">
            <dt>Applications</dt>
            <dd><b className={`qualifying-app-inline is-${app.kind}`}>{app.label}</b><span>{app.detail ? `${app.detail} ` : ''}{s.applications?.note ?? 'Application dates for this edition are not listed yet.'}{app.kind === 'closed' && s.key === 'sydney' ? ' Shown for reference.' : ''}</span></dd>
          </div>
          <div className="is-wide"><dt>Entry</dt><dd><span className="qualifying-entry">{s.entry}</span></dd></div>
        </dl>

        {s.key === 'boston' ? <BostonHistory margin={r.margin} outside={r.status === 'outside-window'} /> : null}
        {pools.length && r.margin !== null && r.margin >= 0 && !nyrrGuaranteed ? (
          <p className="tool-callout qualifying-pool">
            <strong>The capped pool.</strong> NYRR reported how far under their standard non-NYRR qualifiers had to be: {listWords(pools.map((p) => `${formatDuration(p.seconds)} for ${p.year} (${p.accepted} accepted)`))}.
            {' '}A margin of {formatMargin(r.margin)} {poolSentence(r.margin, pools)}.
            {' '}NYRR does not publish the next one in advance, and neither does Pace Notes.
          </p>
        ) : null}

        <details className="qualifying-fine">
          <summary>Rules and fine print<span className="sr-only">: {SHORT[s.key]}</span></summary>
          <ul>{fine.map((f) => <li key={f}>{f}</li>)}</ul>
        </details>

        <p className="qualifying-sources">
          {sources.map((src) => <a key={src.url} href={src.url} rel="noopener noreferrer">{src.label}<span aria-hidden="true"> ↗</span></a>)}
          <span className="qualifying-checked">Checked <time dateTime={VERIFIED_AT}>{VERIFIED_AT}</time></span>
        </p>
      </div>
    </EvidencePanel>
  );
}

/* ---------- Boston: every past cut-off against this margin ---------- */

function BostonHistory({ margin, outside }: { margin: number | null; outside: boolean }) {
  const random = BOSTON_STANDARD.randomSelection;
  const draw = random ? BOSTON_CUTOFFS.find((c) => c.year === random.year) : undefined;
  const share = random && draw ? random.drawn / (draw.notAccepted + random.drawn) : null;
  const sorted = [...BOSTON_CUTOFFS].sort((a, b) => a.cutoff - b.cutoff);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const zeroYears = BOSTON_CUTOFFS.filter((c) => c.cutoff === 0).map((c) => c.year);
  const sum = margin !== null ? cutoffSummary(margin) : null;
  return (
    <section className="qualifying-boston" aria-labelledby="qualifying-boston-history">
      <h3 id="qualifying-boston-history">Your margin against every past cut-off</h3>
      {margin === null ? <p className="qualifying-boston-lead">With no margin to compare, the cut-offs are shown for reference.</p>
        : margin < 0 ? <p className="qualifying-boston-lead">A time {formatMargin(margin).slice(1)} over the standard could not apply in any of these years.</p>
        : <p className="qualifying-boston-lead">A margin of <b>{formatMargin(margin)}</b> would have cleared <b>{sum!.recent} of the last 4</b> ({sum!.span}) and {sum!.all} of the {sum!.total} cut-offs since {BOSTON_CUTOFFS[0].year}.{outside ? ' This compares the margin only: the race date is outside the 2028 window.' : ''}</p>}
      <CutoffChart margin={margin} />
      <div className="tool-table-wrap">
        <table className="tool-table qualifying-cutoff-table">
          <thead><tr><th scope="col">Race</th><th scope="col">Cut-off</th><th scope="col">Turned away</th><th scope="col">Cleared</th></tr></thead>
          <tbody>
            {[...BOSTON_CUTOFFS].reverse().map((c) => {
              const cleared = margin !== null && margin >= c.cutoff;
              return (
                <tr key={c.year}>
                  <td>{c.year}{c.note ? <span className="qualifying-row-note">{c.note}</span> : null}</td>
                  <td>{formatDuration(c.cutoff)}</td>
                  <td>{grouped(c.notAccepted)}</td>
                  <td className={cleared ? 'is-minus' : undefined}>{cleared ? '✓ yes' : <span className="qualifying-dim">no</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tool-note qualifying-table-note">Cut-off: how far under their standard applicants had to be, as announced by the B.A.A. “Turned away” counts qualifiers who applied and were not accepted. “Cleared” means your margin was at least the cut-off. No cut-off is listed for {BOSTON_CUTOFFS[0].year + 1}.</p>
      {random && draw && share !== null ? (
        <p className="tool-callout qualifying-draw">
          <strong>{random.year} random selection.</strong> For {random.year} the B.A.A. also drew about {grouped(random.drawn)} qualifiers at random from those who missed the {formatDuration(draw.cutoff)} cut-off. By our derivation from B.A.A. counts ({grouped(random.drawn)} ÷ ({grouped(draw.notAccepted)} turned away + {grouped(random.drawn)} drawn)), that was about {Math.round(share * 100)}% of that group. The B.A.A. has not said whether the draw will continue.
        </p>
      ) : null}
      <p className="tool-note">The B.A.A. does not predict cut-offs, and Pace Notes does not either. They have ranged from {formatDuration(lowest.cutoff)} ({zeroYears.join(' and ')}) to {formatDuration(highest.cutoff)} ({highest.year}{highest.note ? `, ${highest.note.toLowerCase()}` : ''}).</p>
    </section>
  );
}

function CutoffChart({ margin }: { margin: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 520;
  const H = narrow ? 200 : 230;
  const m = { l: 40, r: 8, t: 30, b: 26 };
  const rows = BOSTON_CUTOFFS;
  const maxCut = Math.max(...rows.map((c) => c.cutoff));
  const yMax = margin !== null && margin > maxCut && margin <= 600 ? Math.ceil((margin + 30) / 120) * 120 : Math.ceil((maxCut + 10) / 120) * 120;
  const plotW = Math.max(120, width - m.l - m.r);
  const plotH = H - m.t - m.b;
  const step = plotW / rows.length;
  const barW = Math.max(6, Math.min(26, step * 0.62));
  const x = (i: number) => m.l + step * i + step / 2;
  const y = (v: number) => m.t + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += 120) ticks.push(t);
  const sum = margin !== null && margin >= 0 ? cutoffSummary(margin) : null;
  const label = `Column chart of Boston Marathon cut-offs from ${rows[0].year} to ${rows[rows.length - 1].year}, from 0:00 to ${formatDuration(maxCut)} under the standard. `
    + (margin === null ? 'No margin to compare.' : margin < 0 ? `Your time is ${formatMargin(margin).slice(1)} over the standard, so it clears none.` : `Your margin of ${formatMargin(margin)} would have cleared ${sum!.all} of ${sum!.total}, including ${sum!.recent} of the last 4 (${sum!.span}).`);
  const lineY = margin !== null && margin >= 0 ? y(margin) : null;
  const above = margin !== null && margin > yMax;
  return (
    <div className="viz qualifying-cutoff-chart" ref={ref}>
      <div className="qualifying-legend" aria-hidden="true">
        <span><i className="is-cleared" />Cleared by your margin</span>
        <span><i className="is-not" />Not cleared</span>
        {lineY !== null ? <span><i className="is-line" />Your margin</span> : null}
      </div>
      <svg width={width} height={H} role="img" aria-label={label}>
        <defs>
          <pattern id="qualifying-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--paper-2)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--line-2)" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{formatDuration(t)}</text>
          </g>
        ))}
        {rows.map((c, i) => {
          const cleared = margin !== null && margin >= c.cutoff;
          const top = y(c.cutoff);
          const h = Math.max(0, m.t + plotH - top);
          return (
            <g key={c.year}>
              {h > 0 ? <rect x={x(i) - barW / 2} y={top} width={barW} height={h} rx={2}
                fill={cleared ? 'var(--green)' : 'url(#qualifying-hatch)'} stroke={cleared ? 'var(--green-ink)' : 'var(--ink-3)'} strokeWidth={cleared ? 0 : 1} />
                : <rect x={x(i) - barW / 2} y={m.t + plotH - 2} width={barW} height={2} fill={cleared ? 'var(--green-ink)' : 'var(--ink-3)'} />}
              <text x={x(i)} y={H - 8} textAnchor="middle" className={narrow ? 'qualifying-year-short' : undefined}>{narrow ? String(c.year).slice(2) : c.year}</text>
            </g>
          );
        })}
        <line x1={m.l} x2={width - m.r} y1={m.t + plotH} y2={m.t + plotH} stroke="var(--ink-3)" />
        {lineY !== null ? <line className="qualifying-margin-rule" x1={m.l} x2={width - m.r} y1={lineY} y2={lineY} /> : null}
        {/* Value labels sit above the margin line; their halo masks it where the two cross, so the numbers stay legible. */}
        {!narrow ? rows.map((c, i) => <text key={c.year} x={x(i)} y={y(c.cutoff) - 6} textAnchor="middle" className="qualifying-bar-value">{formatDuration(c.cutoff)}</text>) : null}
        {lineY !== null ? (
          <text className="annotation qualifying-margin-label" x={m.l + 4} y={lineY - 7}>
            {above ? `Your margin ${formatMargin(margin!)} is above every cut-off ▲` : `Your margin ${formatMargin(margin!)}`}
          </text>
        ) : margin !== null ? (
          <text className="annotation" x={m.l + 6} y={m.t - 12}>Your time is {formatMargin(margin).slice(1)} over the standard</text>
        ) : null}
      </svg>
    </div>
  );
}

/* ---------- Targets: standard minus a buffer, and the even pace for it ---------- */

function TargetsPanel({ items, seconds, buffer, setBuffer, drop, units, gender }: {
  items: Item[]; seconds: number; buffer: number; setBuffer: (n: number) => void; drop?: Drop; units: UnitSystem;
  /** The division the visitor chose, passed to the pace band's observed columns (none for non-binary or the example division). */
  gender: 'men' | 'women' | null;
}) {
  // A course the race does not accept has no target on it; the note below says which races are left out.
  const rows = items.filter((it) => it.r.limit !== null && !it.courseOut);
  const leftOut = items.filter((it) => it.courseOut).map((it) => SHORT[it.s.key]);
  const bostonIndex = drop ? bostonIndexFor(drop) ?? 0 : 0;
  const target = (it: Item) => it.r.limit! - (it.s.key === 'boston' ? bostonIndex : 0) - buffer * 60 - (it.s.comparison === 'strictly-under' ? 1 : 0);
  // Pace band and course chooser goals are whole minutes: the minute at or below the target, as H:MM.
  const goalParam = (t: number) => { const mins = Math.floor(t / 60); return `${Math.floor(mins / 60)}:${pad(mins % 60)}`; };
  const bandHref = (t: number) => `/tools/pace-band?goal=${goalParam(t)}${gender ? `&g=${gender}` : ''}`;
  const bostonRow = rows.find((it) => it.s.key === 'boston');
  const focus = bostonRow ?? rows[0];
  const focusT = focus ? target(focus) : null;
  const observed = focusT !== null && within(focusT, OBSERVED_RANGE);
  const allLinked = rows.every((it) => within(target(it), BAND_RANGE));
  // The buttons stay focusable at 0 and 30 (aria-disabled), so a keyboard user's focus never falls back to the page.
  const set = (n: number) => setBuffer(Math.max(0, Math.min(30, n)));
  return (
    <EvidencePanel kind="arithmetic" title="Times to aim for" meta="Each standard minus the buffer you choose, and the even pace for it. Arithmetic on the official standards: it does not forecast a cut-off.">
      <div className="qualifying-buffer no-print">
        <span className="tool-label" id="qualifying-buffer-label">Buffer under each standard</span>
        <div className="tool-stepper" role="group" aria-labelledby="qualifying-buffer-label">
          <button type="button" aria-label="One minute less buffer" aria-disabled={buffer <= 0 || undefined} onClick={() => { if (buffer > 0) set(buffer - 1); }}>−</button>
          <div className="tool-stepper-value"><b className="qualifying-buffer-value" aria-live="polite">{buffer} min</b></div>
          <button type="button" aria-label="One minute more buffer" aria-disabled={buffer >= 30 || undefined} onClick={() => { if (buffer < 30) set(buffer + 1); }}>+</button>
        </div>
      </div>
      <div className="tool-table-wrap">
        <table className="tool-table wrap-first qualifying-targets">
          <thead><tr><th scope="col">Race</th><th scope="col">Aim for</th><th scope="col" className="qualifying-pace-col">Pace /{units}</th><th scope="col">Your margin</th></tr></thead>
          <tbody>
            {rows.map((it) => {
              const t = target(it);
              const diff = t - seconds;
              return (
                <tr key={it.s.key} className={it === focus ? 'is-key' : undefined}>
                  <td>{SHORT[it.s.key]} {yearOf(it.s)}<span className="qualifying-row-note">standard {fmtTime(it.r.limit!)}{it.s.key === 'boston' && bostonIndex ? `, −${bostonIndex / 60}:00 index` : ''}</span></td>
                  <td>
                    {within(t, BAND_RANGE) ? <Link href={bandHref(t)} aria-label={`${fmtTime(t)}: pace band for this target`}>{fmtTime(t)}</Link> : fmtTime(t)}
                    <span className="qualifying-pace-inline">{formatDuration(perUnit(t / MARATHON_KM, units))}/{units}</span>
                  </td>
                  <td className="qualifying-pace-col">{formatDuration(perUnit(t / MARATHON_KM, units))}</td>
                  <td className={diff >= 0 ? 'is-minus' : 'is-plus'}>{formatMargin(diff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tool-note qualifying-table-note">
        Your margin is how far your {fmtTime(seconds)} is under (+) or over (−) each target. Paces are even-pace arithmetic over {units === 'mi' ? '26.22 mi' : '42.195 km'}. {rows.some((it) => it.s.comparison === 'strictly-under') ? 'London needs a time strictly under its standard, so its target is a second inside. ' : ''}
        {bostonIndex ? `Boston’s target includes the ${bostonIndex / 60}:00 downhill index for your course. ` : ''}{leftOut.length ? `${leftOut.join(' and ')} ${leftOut.length > 1 ? 'are' : 'is'} left out: ${leftOut.length > 1 ? 'they do' : 'it does'} not accept a course with this drop. ` : ''}{allLinked ? 'Each target links to a pace band for its whole minute.' : 'Targets from 1:30 to 8:00 link to a pace band for their whole minute.'}
      </p>
      {focus && focusT !== null && within(focusT, BAND_RANGE) ? (
        <p className="tool-callout qualifying-plan no-print">
          <strong>Planning a {SHORT[focus.s.key]} attempt at {fmtTime(focusT)}?</strong>{' '}
          {observed ? <>The <Link href={bandHref(focusT)}>pace band</Link> shows what finishes near that time actually ran at each 5 km mat, and the <Link href={`/tools/course-chooser?goal=${goalParam(focusT)}`}>course chooser</Link> compares courses at that pace.</>
            : <>The <Link href={bandHref(focusT)}>pace band</Link> gives even-pace splits for it. Its observed columns and the <Link href="/tools/course-chooser">course chooser</Link> cover goals from 2:30 to 6:30 only.</>}
        </p>
      ) : null}
    </EvidencePanel>
  );
}
