'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { EvidenceTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { ToolHandoffs } from '@/components/tools/Handoffs';
import DotGrid from '@/components/viz/DotGrid';
import { Choice, ShareBar } from '@/components/tools/ui';
import Values from '@/components/ui/Values';
import { useQueryState } from '@/components/tools/useQueryState';
import KeypadHint from '@/components/KeypadHint';
import { useWidth } from '@/components/viz/useSize';
import { fitTicks } from '@/components/tools/ticks';
import { runnerHandoff } from '@/lib/analytics-policy';
import { loadInsight, type Archetype, type Archetypes } from '@/lib/insights';
import { openingBandOf, openingPct, pctSigned, qualifies, reportLink, toneOf, windowCells, windowCheck, type OpeningBand } from '@/lib/report-shared';
import { loadShard, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import type { PaceBandCell } from '@/lib/tools/pace-band-data';
import { MARATHON_KM, MATS_KM, perUnit } from '@/lib/tools/pace';
import { SECTION_KM, SECTION_NAMES, SPLIT_EXAMPLE, classify, readSplits, validateSplits, type SplitReading } from '@/lib/tools/splits';
import { formatDuration, parseDuration } from '@/lib/tools/time';
import { keypadInput } from '@/lib/keypad';
import { KM_PER_MILE, matLabel, sectionLabel, type UnitSystem } from '@/lib/units';
import { SECTION_BOUNDS, count, signedPct } from '@/lib/viz/format';
import { typeStyle } from '@/lib/viz/palette';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const INDEX_PATH = 'tools/pace-band.json';
const ARCHETYPES_PATH = 'archetypes.json';
const CHECKPOINTS = [...MATS_KM, MARATHON_KM];
/** A made-up race that shows every part of the tool: a quick opening and a sustained slowdown from 30 km. */
const EXAMPLE = SPLIT_EXAMPLE;
const DEFAULTS = { s: EXAMPLE, course: 'all', g: 'all' };

type Gender = 'all' | 'men' | 'women';
const GENDER_OPTIONS: { value: Gender; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }];

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * One elapsed mat time as trackers print it. Three groups are h:mm:ss. Two groups are mm:ss when the first is 10 or more
 * ("25:50") and h:mm below 10 ("3:58"): no marathon mat is passed in under ten minutes. Given the previous mat's time, a
 * two-group entry that would go backwards as mm:ss is read as h:mm up to 12 hours ("10:30" after a 9:20:00 40 km mat).
 * Also "2h05m31s" and keypad dots.
 */
export function parseMatTime(input: string, prev: number | null = null, typed = false): number | null {
  const text = typed ? input.trim().toLowerCase().replace(/,/g, '.') : input.trim().toLowerCase();
  if (!text) return null;
  const twoGroups = (a: number, b: number, fraction: number) => {
    if (a < 10) return a * 3600 + b * 60;
    const mmss = Math.round(a * 60 + b + fraction);
    return prev !== null && mmss <= prev && a <= 12 && !fraction ? a * 3600 + b * 60 : mmss;
  };
  // The keypad's 25.50.12 shows 25:50:12 (lib/keypad.ts). In a typed box, from 13 up, three groups are minutes, seconds and
  // hundredths: no mat is reached in under 13 minutes, and the split check reads no time past 12 hours. Pasted tracker text
  // keeps its clocks, since its time-of-day column can read 13:26:31.
  const hundredths = typed ? text.match(/^(\d{2,3})[:.]([0-5]\d)[:.](\d{1,3})$/) : null;
  if (hundredths && Number(hundredths[1]) >= 13) return Math.round(Number(hundredths[1]) * 60 + Number(hundredths[2]) + Number(`0.${hundredths[3]}`));
  // Two digits after each colon: a lone digit ("22:5", the keypad's 22.5) is parseDuration's decimal minutes.
  const colon = text.match(/^(\d{1,3}(?::\d{2}){1,2})(?:\.(\d{1,3}))?$/);
  if (colon) {
    const parts = colon[1].split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    const fraction = colon[2] ? Number(`0.${colon[2]}`) : 0;
    if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2] + fraction);
    return twoGroups(parts[0], parts[1], fraction);
  }
  const keypad = text.match(/^(\d{1,3})[.,](\d{2})$/);
  if (keypad) {
    const [a, b] = [Number(keypad[1]), Number(keypad[2])];
    if (b >= 60) return null;
    return twoGroups(a, b, 0);
  }
  const seconds = parseDuration(text, 'race');
  return seconds !== null && seconds > 0 ? Math.round(seconds) : null;
}

/** The nine fields in order, each read in the context of the last earlier mat that has a time. */
export function parseAll(texts: string[]): (number | null)[] {
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (const text of texts) {
    const t = parseMatTime(text, prev, true);
    out.push(t);
    if (t !== null) prev = t;
  }
  return out;
}

/** Duration-looking tokens in a line, leaving out paces ("5:10/km", "8:19 min/mi") and clock times ("9:12:35 am"). */
function timeTokens(line: string): string[] {
  const out: string[] = [];
  const re = /\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const before = m.index > 0 ? line[m.index - 1] : '';
    const after = line.slice(m.index + m[0].length);
    if (/[\d:]/.test(before) || /^[\d:]/.test(after)) continue;
    if (/^\s*(?:\/|min\b|mins\b|per\b|[ap]\.?m\b|mph|kph|km\/h)/i.test(after)) continue;
    out.push(m[0]);
  }
  return out;
}

const MAT_RE = /(?:^|[^\d.,])0?(5|10|15|20|25|30|35|40)\s*(?:k\b|km\b|kms\b|kilomet)(?!\s*\/\s*h)/i;
const FINISH_RE = /\b(?:finish|fin|final|ziel|zielzeit|netto|net\s*time|chip\s*time|official\s*time|arriv[ée]e|llegada)\b|\b42[.,]\d*\s*(?:k|km)\b|\b42\s*km?\b|\b26[.,]2\s*mi/i;
/** "Marathon 4:03:31": a finish label only when no explicit finish line gives a time (a page title can say Marathon too). */
const WEAK_FINISH_RE = /\bmarathon\b/i;
const HALF_RE = /\b(?:half|halfway|halb|hm|semi|mitad|21[.,]1\d*|13[.,]1)\b/i;

export interface PasteResult { times: (number | null)[]; found: number; labelled: boolean; tokens: number; skippedHalf?: boolean }

/**
 * Read nine mat times from pasted tracker or results text. Lines labelled 5K…40K and Finish are matched by label (halfway and
 * mile lines are ignored, and the first plausible time on each line wins); unlabelled text must hold exactly nine times in order.
 */
export function readPasted(text: string): PasteResult {
  // Every plausible time on each labelled line, in order (a results table may also hold time of day and section times).
  // For each mat the first labelled line that holds a time wins (a header row of labels holds none); finish lines add up,
  // explicit labels before "Marathon".
  const candidates: number[][] = CHECKPOINTS.map(() => []);
  const weakFinish: number[] = [];
  let labelled = false;
  for (const raw of text.split(/[\n;|]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const mat = line.match(MAT_RE);
    let index = -1;
    let weak = false;
    if (mat) index = MATS_KM.indexOf(Number(mat[1]) as (typeof MATS_KM)[number]);
    else if (!HALF_RE.test(line) && FINISH_RE.test(line)) index = 8;
    else if (!HALF_RE.test(line) && WEAK_FINISH_RE.test(line)) { index = 8; weak = true; }
    if (index < 0) continue;
    labelled = true;
    if (index < 8 && candidates[index].length) continue;
    const km = CHECKPOINTS[index];
    const target = weak ? weakFinish : candidates[index];
    for (const token of timeTokens(mat ? line.slice((mat.index ?? 0) + mat[0].length) : line)) {
      const s = parseMatTime(token);
      if (s !== null && s / km >= 120 && s / km <= 1200 && !target.includes(s)) target.push(s);
    }
  }
  for (const s of weakFinish) if (!candidates[8].includes(s)) candidates[8].push(s);
  const times = chooseSequence(candidates);
  const found = times.filter((t) => t !== null).length;
  if (labelled && found) return { times, found, labelled: true, tokens: found };
  const tokens = timeTokens(text).map((token) => parseMatTime(token)).filter((t): t is number => t !== null);
  if (tokens.length === 9) return { times: tokens, found: 9, labelled: false, tokens: 9 };
  // An unlabelled list with halfway in it: ten times, the fifth between 20 and 25 km at a plausible pace from the 20 km mat.
  if (tokens.length === 10) {
    const rest = tokens.filter((_, i) => i !== 4);
    const half = (tokens[4] - tokens[3]) / (21.0975 - 20);
    if (tokens[4] > tokens[3] && tokens[4] < tokens[5] && half >= 120 && half <= 1200 && validateSplits(rest) === null) {
      return { times: rest, found: 9, labelled: false, tokens: 10, skippedHalf: true };
    }
  }
  return { times: Array(9).fill(null), found: 0, labelled: false, tokens: tokens.length };
}

/**
 * One time per labelled mat so the whole race is consistent: increasing, and every gap between recorded mats at 2–20 min/km.
 * Earlier tokens on a line are preferred; if no consistent choice exists, each mat keeps its first plausible time.
 */
function chooseSequence(candidates: number[][]): (number | null)[] {
  const out: (number | null)[] = candidates.map(() => null);
  const present = candidates.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
  let steps = 0;
  const fits = (i: number, t: number, prevI: number, prevT: number) => {
    const pace = (t - prevT) / (CHECKPOINTS[i] - (prevI >= 0 ? CHECKPOINTS[prevI] : 0));
    return t > prevT && pace >= 120 && pace <= 1200;
  };
  const go = (k: number, prevI: number, prevT: number): boolean => {
    if (k === present.length) return true;
    if ((steps += 1) > 20000) return false;
    const i = present[k];
    for (const t of candidates[i]) {
      if (!fits(i, t, prevI, prevT)) continue;
      out[i] = t;
      if (go(k + 1, i, t)) return true;
    }
    out[i] = null;
    return false;
  };
  if (go(0, -1, 0)) return out;
  return candidates.map((c) => c[0] ?? null);
}

const serialize = (times: (number | null)[]) => (times.every((t) => t === null) ? '' : times.map((t) => (t === null ? '' : formatDuration(t, true))).join(','));
const fromQuery = (s: string) => {
  const parts = s.split(',');
  return parseAll(CHECKPOINTS.map((_, i) => parts[i] ?? ''));
};
/** A field's text: mm:ss is kept for the first two mats under an hour; from 15 km the hours always show, so a misread is visible. */
const displayTime = (t: number | null, i: number) => (t === null ? '' : formatDuration(t, i >= 2));
const displayAll = (times: (number | null)[]) => times.map(displayTime);

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const fmtPace = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;
const share = (v: number) => `${Math.round(v * 100)}%`;
/** A section's name, the same in both unit modes: "30–35K", "40K–finish". */
const secName = (i: number) => sectionLabel(SECTION_BOUNDS[i][0], SECTION_BOUNDS[i][1]);
/** The reference block, the runner's own 5–20K pace. */
const BASE = sectionLabel(5, 20);
/** Moves focus to a results panel's heading, for a control that is about to remove itself. */
function focusHeading(panelId: string) {
  const h = document.querySelector<HTMLElement>(`#${panelId} .tool-panel-title`);
  if (!h) return;
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  h.focus();
}

/* ------------------------------------------------------------------ */
/* Data hooks                                                          */
/* ------------------------------------------------------------------ */

/** The loader's own neutral message ("could not be loaded" / "could not be verified"); a browser network error reads as the first. */
const errorText = (e: unknown) => (e instanceof Error && e.message.startsWith('This data') ? e.message : 'This data could not be loaded. Check the connection and try again.');

/** One verified insights file. `error` holds the loader's message; `retry` runs the load again (failed loads are not cached). */
function useVerified<T>(path: string, sha: string | null): { data: T | null; error: string | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!sha) return;
    let live = true;
    loadInsight<T>(path, sha).then((data) => { if (live) setState({ data, error: null }); }, (e: unknown) => { if (live) setState({ data: null, error: errorText(e) }); });
    return () => { live = false; };
  }, [path, sha, attempt]);
  const retry = useCallback(() => { setState({ data: null, error: null }); setAttempt((a) => a + 1); }, []);
  return sha ? { ...state, retry } : { data: null, error: 'missing', retry };
}

function useShard(index: PaceBandIndex | null, path: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; attempt: number; data: PaceBandShard | null; error: string | null } | null>(null);
  const listed = Boolean(index?.shards?.[path]);
  useEffect(() => {
    if (!index || !listed) return;
    let live = true;
    loadShard<PaceBandShard>(index, path).then((data) => { if (live) setState({ path, attempt, data, error: null }); }, (e: unknown) => { if (live) setState({ path, attempt, data: null, error: errorText(e) }); });
    return () => { live = false; };
  }, [index, path, listed, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { result: state && state.path === path && state.attempt === attempt ? state : null, retry };
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

type Comparison =
  | { state: 'off'; message: string; retry?: () => void }
  | { state: 'loading' }
  | { state: 'unavailable'; title: string; message: string }
  | { state: 'ok'; minute: number; lo: number; hi: number; all: PaceBandCell; held: PaceBandCell | null; slow: PaceBandCell | null };

/** `value`, except while `hold` is true: then the value from the last render without the hold. */
function useHeld<T>(value: T, hold: boolean): T {
  const [kept, setKept] = useState(value);
  if (!hold && !Object.is(kept, value)) setKept(value);
  return hold ? kept : value;
}

type FieldIssue = 'unreadable' | 'order' | 'pace' | 'finish';
const matWord = (i: number) => (i === 8 ? 'finish' : `${CHECKPOINTS[i]} km`);

/** What is wrong with one field, naming the mats involved. */
function issueText(i: number, kind: FieldIssue, parsed: (number | null)[]): string {
  if (kind === 'unreadable') return `Couldn’t read the ${matWord(i)} time. Use h:mm:ss (1:45:54), or mm:ss before the first hour (25:50).`;
  if (kind === 'order') return `The ${matWord(i)} time must be later than the ${matWord(i - 1)} time.`;
  if (kind === 'finish') return 'The finish must be between 1:30:00 and 12:00:00.';
  const pace = ((parsed[i] ?? 0) - (i ? parsed[i - 1] ?? 0 : 0)) / SECTION_KM[i];
  return `The ${SECTION_NAMES[i]} km section works out at ${formatDuration(pace)} per km; every section must be between 2:00 and 20:00 per km. Check the ${i ? `${matWord(i - 1)} and ${matWord(i)} times` : `${matWord(i)} time`}.`;
}

export default function SplitCheck({ indexSha, archetypesSha, openingBands, openingCities, bandCourses, otherCourses }: {
  indexSha: string | null; archetypesSha: string | null; openingBands: OpeningBand[]; openingCities: string[];
  /** Course slugs the pace band (and so this comparison) publishes, read at build time. */
  bandCourses: string[];
  /** Cities other Pace Notes data knows but this comparison does not, by slug (a runner-page link may name one). */
  otherCourses: Record<string, string>;
}) {
  const { units } = useUnits();
  const [q, setQ, ready, fromUrl] = useQueryState(DEFAULTS);
  const [texts, setTexts] = useState<string[]>(() => Array(9).fill(''));
  const [loaded, setLoaded] = useState(false);
  // The field being typed in: changed since it took focus. Cleared when focus leaves it.
  const [typing, setTyping] = useState<number | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  // The course slug a link named that this comparison does not have; it falls back to All courses.
  const [droppedCourse, setDroppedCourse] = useState<string | null>(null);
  // The visitor has changed the times on this page (typed, pasted, cleared or loaded the example).
  const [touched, setTouched] = useState(false);
  // Opened from a runner's record (via=runner): the race report link keeps the marker and never carries g, as the
  // report's own links do, so the pages it leads to are not recorded either.
  const [fromRunner, setFromRunner] = useState(false);
  useEffect(() => { setFromRunner(runnerHandoff(window.location.href)); }, []);
  const formId = useId();

  // The URL is read once after mount, and nothing is read before it, so a shared link never shows the example race first.
  // The nine fields follow the URL then, and every edit is mirrored back.
  useEffect(() => {
    if (!ready) return;
    setTexts(displayAll(fromQuery(q.s)));
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const parsed = useMemo(() => parseAll(texts), [texts]);
  const setTimes = (next: (number | null)[]) => {
    setTouched(true);
    setTexts(displayAll(next));
    setQ({ s: serialize(next) });
  };
  const editField = (i: number, value: string) => {
    const next = texts.map((t, k) => (k === i ? value : t));
    setTyping(i);
    setTouched(true);
    setTexts(next);
    setQ({ s: serialize(parseAll(next)) });
  };
  const blurField = (i: number) => {
    setTyping(null);
    const s = parsed[i];
    if (s !== null) setTexts((prev) => prev.map((t, k) => (k === i ? displayTime(s, i) : t)));
  };
  const onPaste = (value: string) => {
    setPasteText(value);
    if (!value.trim()) { setPasteNote(null); return; }
    const read = readPasted(value);
    if (read.found === 9) {
      setTimes(read.times);
      setPasteNote(read.labelled ? 'Read all nine mat times from their labels. Check them below.'
        : read.skippedHalf ? 'Read nine times in order and skipped the fifth, which sits where halfway would be. Check them below.'
        : 'Read nine times in order, 5 km to the finish. Check them below.');
    } else if (read.labelled && read.found > 0) {
      setTimes(read.times);
      const got = read.times.map((t, i) => (t === null ? null : i === 8 ? 'the finish' : `${CHECKPOINTS[i]}`)).filter(Boolean);
      setPasteNote(`Read ${read.found} of the nine: ${got.join(', ')}${got.includes('the finish') ? '' : ' km'}. Type the rest below.`);
    } else if (read.tokens > 0) {
      setPasteNote(`Found ${read.tokens} time${read.tokens === 1 ? '' : 's'}, not nine. Paste the nine mat times in order (5 km to the finish), or keep each time on a line with its label (5K, 10K … Finish). Halfway and mile splits are skipped only when labelled.`);
    } else {
      setPasteNote('No times found yet. Times look like 25:50 or 1:45:54.');
    }
  };

  // Field-level problems, so the exact box is marked, plus the shared eligibility rules for the whole race.
  const fieldProblem = parsed.map((t, i): FieldIssue | null => {
    if (texts[i].trim() && t === null) return 'unreadable';
    if (t === null) return null;
    const prev = i ? parsed[i - 1] : 0;
    if (prev === null) return null;
    if (t <= prev) return 'order';
    const pace = (t - prev) / SECTION_KM[i];
    if (pace < 120 - 1e-6 || pace > 1200 + 1e-6) return 'pace';
    if (i === 8 && (t < 5400 || t > 43200)) return 'finish';
    return null;
  });
  const entered = parsed.filter((t) => t !== null).length;
  const complete = entered === 9;
  const problem = complete ? validateSplits(parsed) : null;
  const times = complete && !problem ? (parsed as number[]) : null;
  const editing = typing !== null;
  // While a field is being typed in its text may be half done, so neither it nor the next field (checked against it) is flagged.
  const quiet = (i: number) => typing !== null && (i === typing || i === typing + 1);
  const firstIssue = (skip: (i: number) => boolean) => {
    const i = fieldProblem.findIndex((p, k) => p !== null && !skip(k));
    return i < 0 ? null : issueText(i, fieldProblem[i] as FieldIssue, parsed);
  };
  const blockMessage = firstIssue(() => false) ?? problem;
  const hintIssue = firstIssue(quiet) ?? (editing ? null : problem);

  // What the results column shows, as a key. While a field is being typed in and does not yet make a valid race, the
  // column keeps what it showed before (the last valid race, dimmed), instead of jumping between states on each keystroke.
  const currentView = !loaded ? 'l' : times ? `r${times.join(',')}` : blockMessage ? `e${blockMessage}` : 'p';
  const view = useHeld(currentView, editing && !times);
  const shownTimes = useMemo(() => (view[0] === 'r' ? view.slice(1).split(',').map(Number) : null), [view]);
  const reading = useMemo(() => (shownTimes ? readSplits(shownTimes) : null), [shownTimes]);
  const stale = shownTimes !== null && !times;
  // The shared example marker: the times are the made-up example and did not come from the link. A linked course or gender
  // does not change the race being read, so it keeps the marker.
  const isExample = loaded && q.s === EXAMPLE && (touched || !fromUrl.has('s'));

  // Verified data: the pace-band index and one shard per course and recorded gender; the pacing-type classifier.
  const index = useVerified<PaceBandIndex>(INDEX_PATH, indexSha);
  const archetypes = useVerified<Archetypes>(ARCHETYPES_PATH, archetypesSha);
  const gender: Gender = q.g === 'men' || q.g === 'women' ? q.g : 'all';
  const shardPath = `tools/pace-band/${q.course}/${gender}.json`;
  const { result: shard, retry: retryShard } = useShard(index.data, shardPath);
  const scope = index.data?.scopes.find((s) => s.slug === q.course) ?? null;
  const place = q.course === 'all' ? 'all courses' : scope?.city ?? q.course;
  const where = q.course === 'all' ? 'on all courses' : `in ${place}`;
  const genderWord = gender === 'all' ? '' : gender;

  // A link naming a course this comparison does not have falls back to All courses, with a note by the course list: a plain
  // note for a race Pace Notes knows from other data (a runner page links every race), an error for an unknown slug.
  const knownCourses = useMemo(() => (index.data ? index.data.scopes.map((s) => s.slug) : bandCourses.length ? ['all', ...bandCourses] : null), [index.data, bandCourses]);
  useEffect(() => {
    if (!ready || !knownCourses || q.course === 'all' || knownCourses.includes(q.course)) return;
    setDroppedCourse(q.course);
    setQ({ course: 'all' });
  }, [ready, knownCourses, q.course, setQ]);
  const droppedCity = droppedCourse ? otherCourses[droppedCourse] ?? null : null;

  const indexError = index.error;
  const retryIndex = index.retry;
  const comparison: Comparison = useMemo(() => {
    if (!shownTimes) return { state: 'loading' };
    if (indexError) {
      return indexSha ? { state: 'off', message: `${indexError} Your own splits above are unaffected.`, retry: retryIndex }
        : { state: 'off', message: 'The comparison data is not part of this build. Your own splits above are unaffected.' };
    }
    if (!index.data) return { state: 'loading' };
    if (!scope) return q.course === 'all' ? { state: 'off', message: 'The comparison data has no All courses group, so nothing is shown.' } : { state: 'loading' };
    // The window and its groups are shared with the race report (lib/report.ts), so both show the same finishes.
    const check = windowCheck(index.data, scope, gender, shardPath, shownTimes[8]);
    if (check.state === 'range') {
      return { state: 'unavailable', title: 'Outside the compared range.', message: `Comparisons are available for finishes from ${formatDuration(check.from, true)} to ${formatDuration(check.to, true)}. Your section paces, slowdown reading and pacing type still apply.` };
    }
    if (check.state === 'unpublished') {
      return { state: 'unavailable', title: 'Not published for this selection.', message: 'Your section paces, slowdown reading and pacing type still apply.' };
    }
    if (!shard) return { state: 'loading' };
    if (shard.error || !shard.data) return { state: 'off', message: shard.error ?? 'This data could not be loaded. Check the connection and try again.', retry: retryShard };
    const { lo, hi, all, held, slow } = windowCells(shard.data, check.minute, index.data.window_s);
    if (!all) return { state: 'unavailable', title: 'Too few finishes at your time.', message: `Too few finishes ran ${formatDuration(lo, true)} to ${formatDuration(hi, true)} ${where}${genderWord ? ` (recorded as ${genderWord})` : ''} to compare.` };
    return { state: 'ok', minute: check.minute, lo, hi, all, held, slow };
  }, [shownTimes, indexError, retryIndex, indexSha, index.data, scope, q.course, gender, shardPath, shard, retryShard, where, genderWord]);

  const type = useMemo(() => {
    if (!reading || !archetypes.data) return null;
    const c = archetypes.data.classifier;
    const k = classify(reading.relative, c);
    const name = c.names[k];
    const at = archetypes.data.archetypes.findIndex((a) => a.name === name);
    const arch = archetypes.data.archetypes[at >= 0 ? at : k];
    return { name, arch, index: at >= 0 ? at : k, all: archetypes.data.archetypes };
  }, [reading, archetypes.data]);

  // These buttons, Try again and Load the example remove themselves when pressed, so focus moves on first instead of
  // falling to the page.
  const focusCompare = () => focusHeading('split-check-compare');
  const fallbacks = q.course !== 'all' || gender !== 'all' ? (
    <>
      {q.course !== 'all' ? <button type="button" className="btn btn-secondary is-compact" onClick={() => { focusCompare(); setDroppedCourse(null); setQ({ course: 'all' }); }}>Switch to All courses</button> : null}
      {gender !== 'all' ? <button type="button" className="btn btn-secondary is-compact" onClick={() => { focusCompare(); setQ({ g: 'all' }); }}>Switch to all genders</button> : null}
    </>
  ) : null;

  // One short status line for screen readers, updated only when no field is being typed in.
  const verdict = reading ? verdictOf(reading) : null;
  const settled = view === 'l' ? '' : verdict && shownTimes && !stale ? `${verdict.kicker}. ${pctSigned(verdict.value, 0)}: ${verdict.line} Finish ${formatDuration(shownTimes[8], true)}.`
    : view[0] === 'e' ? `Check your times. ${view.slice(1)}` : '';
  const status = useHeld(settled, editing);

  const hintId = `${formId}-grid-hint`;
  const gridMessage = hintIssue ?? (!complete ? (entered ? `${entered} of 9 entered. Every mat is needed; gaps are never filled in.` : 'Type or paste your nine mat times.') : null);

  return (
    <div className="split-check-root">
      <div className="tool-workspace">
        <form className="tool-inputs split-check-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Split check inputs">
          {/* One kicker: the example says so in it, and the line under it says what the example is. */}
          <h2>{isExample ? 'Example · your nine mat times' : 'Your nine mat times'}</h2>
          {isExample ? <p className="tool-field-hint split-check-example">A made-up race with a sustained slowdown from 30K. Type over it or paste your own.</p> : null}

          <details className="split-check-paste" open={pasteOpen} onToggle={(e) => setPasteOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>Paste from a tracker or results page</summary>
            <label htmlFor={`${formId}-paste`} className="sr-only">Pasted split text</label>
            <textarea id={`${formId}-paste`} rows={4} value={pasteText} onChange={(e) => onPaste(e.target.value)} spellCheck={false} autoComplete="off"
              placeholder={'5K 0:25:50\n10K 0:52:24\n…\nFinish 4:03:31'} aria-describedby={`${formId}-paste-note`} />
            <p className="tool-field-hint" id={`${formId}-paste-note`} aria-live="polite">{pasteNote ?? 'Copy the split table and paste it here. Labelled 5K…40K and Finish lines are read; halfway, mile splits, paces and clock times are skipped.'}</p>
          </details>

          <fieldset className="split-check-grid" aria-describedby={hintId}>
            <legend className="sr-only">Elapsed time at each 5 km mat and the finish</legend>
            {CHECKPOINTS.map((km, i) => {
              const bad = fieldProblem[i] !== null && !quiet(i);
              return (
                <div key={km} className={`split-check-cell${i === 8 ? ' is-finish' : ''}`}>
                  <label htmlFor={`${formId}-t${i}`}>
                    <span>{matLabel(km)}</span>
                    <small>{i === 8 ? (units === 'mi' ? '26.2 mi' : '42.2 km') : units === 'mi' ? `${(km / KM_PER_MILE).toFixed(1)} mi` : ' '}</small>
                  </label>
                  <input id={`${formId}-t${i}`} inputMode="decimal" autoComplete="off" spellCheck={false} value={texts[i]}
                    placeholder={i < 2 ? 'mm:ss' : 'h:mm:ss'} aria-invalid={bad || undefined} aria-describedby={hintId}
                    onChange={(e) => editField(i, keypadInput(e.target, e.nativeEvent))} onBlur={() => blurField(i)} />
                </div>
              );
            })}
          </fieldset>
          <p className={`tool-field-hint${hintIssue ? ' is-error' : ''}`} id={hintId}>
            {gridMessage ?? 'Elapsed chip time at each mat: h:mm:ss, or mm:ss before the first hour.'}<KeypadHint />
          </p>
          <div className="split-check-buttons">
            <button type="button" className="btn btn-secondary is-compact" onClick={() => { setTimes(Array(9).fill(null)); setPasteText(''); setPasteNote(null); }}>Clear</button>
            {loaded && !isExample ? <button type="button" className="btn btn-secondary is-compact" onClick={() => {
              document.getElementById(`${formId}-t0`)?.focus();
              setTimes(fromQuery(EXAMPLE)); setPasteText(''); setPasteNote(null);
            }}>Load the example</button> : null}
          </div>

          <div className="tool-field">
            <label htmlFor={`${formId}-course`}>Compare with finishes on</label>
            <select id={`${formId}-course`} value={q.course} onChange={(e) => { setDroppedCourse(null); setQ({ course: e.target.value }); }}
              aria-describedby={`${formId}-course-hint`}>
              <option value="all">All courses</option>
              {index.data ? index.data.scopes.filter((s) => s.slug !== 'all').map((s) => <option key={s.slug} value={s.slug}>{s.city ?? s.slug}</option>)
                : q.course !== 'all' ? <option value={q.course}>{q.course}</option> : null}
            </select>
            <p className={`tool-field-hint${droppedCourse && !droppedCity ? ' is-error' : ''}`} id={`${formId}-course-hint`}>
              {droppedCity ? `${droppedCity} is not one of the split check’s courses, so you are compared with All courses. Your own sections, slowdown reading and pacing type do not depend on the course.`
                : droppedCourse ? 'The course in this link is not in the current data, so All courses is shown.'
                : 'Race not listed? All courses compares you with finishes from other races.'}
            </p>
          </div>
          <div className="tool-field">
            <span className="tool-label" id={`${formId}-gender`}>Recorded gender <span className="split-check-optional">optional</span></span>
            <div role="group" aria-labelledby={`${formId}-gender`} className="ph-no-capture"><Choice label="Recorded gender" value={gender} onChange={(v) => setQ({ g: v })} options={GENDER_OPTIONS} small /></div>
          </div>
          <p className="tool-field-hint split-check-privacy">Your times stay in this browser and the page address. Analytics never record them.</p>
        </form>

        <div className={`tool-results split-check-results${stale ? ' is-stale' : ''}`}>
          {stale ? <p className="split-check-updating" aria-hidden="true">Showing your last complete race</p> : null}
          {view === 'l' ? <div className="tool-state">Reading the times…</div>
            : reading && shownTimes ? (
              <Results times={shownTimes} reading={reading} units={units} comparison={comparison} type={type} typeError={archetypes.error} retryType={archetypes.retry}
                where={where} place={place} genderWord={genderWord} course={q.course} gender={gender} fallbacks={fallbacks}
                openingBands={openingBands} openingCities={openingCities} isExample={isExample}
                bandCourse={knownCourses?.includes(q.course) && q.course !== 'all' ? q.course : null}
                reportCity={q.course !== 'all' ? scope?.city ?? null : null} fromRunner={fromRunner} />
            ) : view[0] === 'e' ? (
              <div className="tool-state is-error"><strong>Check your times.</strong> {view.slice(1)}</div>
            ) : (
              <div className="tool-empty">Enter all nine elapsed times (5, 10, 15, 20, 25, 30, 35 and 40 km, and the finish) to read your race. {entered ? `${entered} of 9 so far.` : ''} Missing mats are never estimated.</div>
            )}
        </div>
      </div>
      <p className="sr-only" role="status">{status}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

type TypeResult = { name: string; arch: Archetype; index: number; all: Archetype[] } | null;

function Results({ times, reading, units, comparison, type, typeError, retryType, where, place, genderWord, course, gender, fallbacks, openingBands, openingCities, isExample, bandCourse, reportCity, fromRunner }: {
  times: number[]; reading: SplitReading; units: UnitSystem; comparison: Comparison; type: TypeResult; typeError: string | null; retryType: () => void;
  where: string; place: string; genderWord: string; course: string; gender: Gender; fallbacks: ReactNode; openingBands: OpeningBand[]; openingCities: string[]; isExample: boolean;
  /** The chosen course when the pace band publishes it, else null. */
  bandCourse: string | null;
  /** The compared course's name for the race report link (null for all courses). */
  reportCity: string | null;
  /** The page was opened from a runner's record (via=runner). */
  fromRunner: boolean;
}) {
  const verdict = verdictOf(reading);
  const avg = times[8] / MARATHON_KM;
  const finish = formatDuration(times[8], true);
  // The pace band takes goals from 1:30 to 8:00 as the whole minute at or below the finish, the course when it publishes
  // it, and the recorded gender chosen here.
  const goalMinute = Math.floor(times[8] / 60);
  const bandGoal = goalMinute >= 90 && goalMinute <= 480 ? `goal=${formatHMGoal(times[8])}` : '';
  const bandQuery = [bandGoal, bandCourse ? `course=${bandCourse}` : '', gender !== 'all' ? `g=${gender}` : ''].filter(Boolean).join('&');
  // The race report reads the same times, course and comparison group (none from a runner's record); the made-up example
  // gets no report.
  const report = isExample ? null : reportLink(times, reportCity, gender, fromRunner);
  return (
    <>
      <section className="tool-reading night split-check-headline" aria-labelledby="split-check-title">
        <div className="tool-reading-head">
          <p className="tool-reading-kicker">{isExample ? 'Example · ' : ''}{verdict.kicker}</p>
          <h2 className="tool-reading-figure" id="split-check-title">
            <span className={verdict.qualifies ? 'is-signal' : undefined}>{pctSigned(verdict.value, 0)}</span>
            <small>{verdict.line}</small>
          </h2>
        </div>
        <SectionBars reading={reading} units={units} />
        <dl className="tool-cells">
          <div><dt>Finish</dt><dd>{finish}<small>{fmtPace(avg, units)}</small></dd></div>
          <div><dt>{BASE} pace</dt><dd>{fmtPace(reading.baseline, units)}</dd></div>
        </dl>
        <EvidenceTag kind="research" />
      </section>

      <Values id="split-check-sections" caption={`Every section: its time, its pace and its difference from your ${BASE} pace (positive is slower)`} count={9}>
        <SectionTable reading={reading} times={times} units={units} />
      </Values>

      <OpeningBeat reading={reading} units={units} bands={openingBands} cities={openingCities} place={place} course={course} gender={gender} />

      <ComparisonPanel comparison={comparison} where={where} genderWord={genderWord} fallbacks={fallbacks} />

      <TypePanel reading={reading} type={type} error={typeError} retry={retryType} units={units} />

      <div className="print-only split-check-print">
        <p>Pace Notes split check{isExample ? ' (example race)' : ''}. Mat times entered: {CHECKPOINTS.map((km, i) => `${matLabel(km)} ${formatDuration(times[i], true)}`).join(' · ')}.</p>
      </div>

      <ToolHandoffs label="Next race" links={[
        { href: `/tools/pace-band${bandQuery ? `?${bandQuery}` : ''}`, title: 'Pace band', text: <>A wristband for {bandGoal ? formatHMGoal(times[8]) : 'your goal'}, beside the mat times of finishes that hit it.</> },
        { href: '/stories/pacing-types', title: 'Six ways to run the same race', text: <>Every pacing type, side by side.</> },
      ]} />
      <ShareBar extra={report ? <Link className="btn btn-primary is-compact" href={report}>Make a race report</Link> : null} />
    </>
  );
}

/** Whole-minute goal for the pace band link: your finish rounded down. */
function formatHMGoal(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The reading on the night card: the section that decides the verdict, against the runner's own 5–20K pace. With a
 * sustained slowdown, the section it began in; without one, the slowest 5K after 20K.
 */
function verdictOf(r: SplitReading): { kicker: string; value: number; qualifies: boolean; line: string } {
  const vs = r.vsBaseline;
  if (r.slowdown && r.onsetKm !== null) {
    const i0 = (r.onsetKm - 20) / 5 + 4;
    return { kicker: `Sustained slowdown from ${matLabel(r.onsetKm)}`, value: vs[i0], qualifies: true,
      line: `Your ${secName(i0)} against your ${BASE} pace.` };
  }
  let worst = 4;
  for (let i = 5; i < 8; i += 1) if (vs[i] > vs[worst]) worst = i;
  const v = vs[worst];
  return { kicker: 'No sustained slowdown', value: v, qualifies: false,
    line: v > -0.02 ? `Your slowest 5K after 20K, ${secName(worst)}, against your ${BASE} pace.` : `Every 5K after 20K was quicker than your ${BASE} pace; ${secName(worst)} came closest.` };
}

/* ------------------------------------------------------------------ */
/* Section bars (calculated from your times)                           */
/* ------------------------------------------------------------------ */

/**
 * Each section's pace as a bar from the runner's own 5–20K pace (the solid line): quicker up, slower down. The 25%-slower
 * line runs from 20K to the finish; sections at or past it after 20K are in the accent, the others quiet. Drawn in
 * pixels at the measured width, on the night card.
 */
function SectionBars({ reading, units }: { reading: SplitReading; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const H = narrow ? 190 : 230;
  const m = { l: 44, r: 4, t: 18, b: 24 };
  const toU = (s: number) => perUnit(s, units);
  const B = toU(reading.baseline);
  const T = B * 1.25;
  const paces = reading.paces.map(toU);
  const minV = Math.min(...paces, B);
  const maxV = Math.max(...paces, T);
  const span0 = Math.max(maxV - minV, 10);
  const tick = [5, 10, 15, 20, 30, 60, 120, 300].find((s) => span0 / s <= 4) ?? 300;
  const lo = Math.floor((minV - span0 * 0.12) / tick) * tick;
  const hi = Math.ceil((maxV + span0 * 0.14) / tick) * tick;
  const iw = Math.max(40, width - m.l - m.r);
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih; // quicker paces at the top
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(v);
  const yB = y(B);
  const yT = y(T);
  const gap = narrow ? 2 : 3;
  // Percentage labels (12 px) beyond the end of each bar, kept clear of every other bar, of the 25% line and of each
  // other: a label that would touch one steps on, away from the base line, 13 px at a time.
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const bars: Box[] = reading.paces.map((_, i) => {
    const [a, b] = SECTION_BOUNDS[i];
    const yp = y(paces[i]);
    return { x0: x(a) + gap, x1: x(b) - gap, y0: Math.min(yp, yB), y1: Math.min(yp, yB) + Math.max(Math.abs(yp - yB), 2) };
  });
  const rule: Box = { x0: x(20), x1: m.l + iw, y0: yT - 3, y1: yT + 3 };
  const placed: Box[] = [];
  // On a phone the sections are too narrow for every figure: only the accent bars keep theirs (or, with none, the
  // slowest 5K after 20K); the Values table under the card has every section.
  const anyQualify = reading.vsBaseline.some((_, i) => toneOf(reading, i) === 'qualify');
  let worst = 4;
  for (let i = 5; i < reading.vsBaseline.length; i += 1) if (reading.vsBaseline[i] > reading.vsBaseline[worst]) worst = i;
  const labelled = (i: number) => !narrow || (anyQualify ? toneOf(reading, i) === 'qualify' : i === worst);
  const labels = reading.vsBaseline.map((v, i) => {
    const [a, b] = SECTION_BOUNDS[i];
    const cx0 = (x(a) + x(b)) / 2;
    const text = pctSigned(v, 0);
    if (text === '0%' || !labelled(i)) return { i, cx: cx0, ly: 0, text: '0%', tone: toneOf(reading, i) };
    const w = text.length * 8.4 + 4; // 12 px semibold figures, measured, with 2 px either side
    const cx = Math.max(w / 2 + 1, Math.min(cx0, width - w / 2 - 1));
    // Slower sections label below their bar, quicker ones above; a label with no room there goes to the other side.
    let below = v >= 0;
    const start = (side: boolean) => (side ? bars[i].y1 + 14 : bars[i].y0 - 5);
    let ly = start(below);
    if (below && ly > H - 2) { below = false; ly = start(false); }
    if (!below && ly < 12) { below = true; ly = start(true); }
    for (let k = 0; k < 10; k += 1) {
      const box = { x0: cx - w / 2, x1: cx + w / 2, y0: ly - 11, y1: ly + 2 };
      if (![...bars.filter((_, j) => j !== i), rule, ...placed].some((p) => hit(box, p))) { placed.push(box); break; }
      ly += below ? 13 : -13;
    }
    ly = Math.max(12, Math.min(ly, H - m.b + 10));
    return { i, cx, ly, text, tone: toneOf(reading, i) };
  });
  const xTicks = fitTicks([0, 10, 20, 30, 40].map((km) => ({ x: x(km), label: km ? `${km}K` : 'Start' })), width);
  const qualifying = reading.vsBaseline.map((v, i) => (i >= 4 && i <= 7 && qualifies(v) ? secName(i) : null)).filter(Boolean);
  const aria = `Each section's pace against your ${BASE} pace of ${fmtPace(reading.baseline, units)}; 25% slower is ${fmtPace(reading.baseline * 1.25, units)}. `
    + reading.paces.map((p, i) => `${secName(i)}: ${fmtPace(p, units)}, ${pctSigned(reading.vsBaseline[i])}`).join('; ')
    + `. ${qualifying.length ? `At least 25% slower after 20K: ${qualifying.join(', ')}.` : 'No 5K section after 20K was 25% or more slower.'}`;
  return (
    <div ref={ref} className="split-check-bars">
      <svg width={width} height={H} role="img" aria-label={aria}>
        {ticks.map((v) => (
          <g key={v} className="split-check-gridline">
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{formatDuration(v)}</text>
          </g>
        ))}
        {xTicks.map((t) => <text key={t.label} className="split-check-tick" x={t.x} y={H - 4} textAnchor={t.anchor}>{t.label}</text>)}
        {reading.paces.map((_, i) => {
          const [a, b] = SECTION_BOUNDS[i];
          const yp = y(paces[i]);
          const top = Math.min(yp, yB);
          const h = Math.max(Math.abs(yp - yB), 2);
          return <rect key={i} className={`split-check-bar is-${toneOf(reading, i)}`} x={x(a) + gap} y={top} width={Math.max(1, x(b) - x(a) - 2 * gap)} height={h} rx={2} />;
        })}
        <line className="split-check-base" x1={m.l} x2={m.l + iw} y1={yB} y2={yB} />
        <line className="split-check-threshold" x1={x(20)} x2={m.l + iw} y1={yT} y2={yT} />
        {/* An even section (0%) is the base line itself: no label, so the ones that moved stand out. */}
        {labels.filter((l) => l.text !== '0%').map((l) => (
          <text key={l.i} x={l.cx} y={l.ly} textAnchor="middle" className={`split-check-bar-label is-${l.tone}`}>{l.text}</text>
        ))}
      </svg>
      <ul className="split-check-key" aria-hidden="true">
        <li className="is-base"><i />{BASE} pace, {fmtPace(reading.baseline, units)}</li>
        <li className="is-threshold"><i />25% slower after 20K</li>
      </ul>
    </div>
  );
}

function SectionTable({ reading, times, units }: { reading: SplitReading; times: number[]; units: UnitSystem }) {
  return (
    <table className="table split-check-table">
      <thead>
        <tr><th scope="col">Section</th><th scope="col">Time</th><th scope="col">Pace /{units}</th><th scope="col">vs {BASE} pace</th></tr>
      </thead>
      <tbody>
        {reading.paces.map((p, i) => (
          <tr key={i} className={toneOf(reading, i) === 'qualify' ? 'is-reading' : undefined}>
            <th scope="row">{secName(i)}</th>
            <td>{formatDuration(times[i] - (i ? times[i - 1] : 0))}</td>
            <td>{formatDuration(perUnit(p, units))}</td>
            <td>{pctSigned(reading.vsBaseline[i])}</td>
          </tr>
        ))}
        <tr><th scope="row">{BASE}</th><td>{formatDuration(times[3] - times[0])}</td><td>{formatDuration(perUnit(reading.baseline, units))}</td><td>—</td></tr>
        <tr><th scope="row">Whole race</th><td>{formatDuration(times[8], true)}</td><td>{formatDuration(perUnit(times[8] / MARATHON_KM, units))}</td><td>{pctSigned(times[8] / MARATHON_KM / reading.baseline - 1)}</td></tr>
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* Opening (calculated, placed among the six published opening groups) */
/* ------------------------------------------------------------------ */

function shortBand(b: OpeningBand): string {
  if (b.lower === null && b.upper !== null) return `< −${Math.abs(b.upper)}%`;
  if (b.upper === null && b.lower !== null) return `> +${b.lower}%`;
  if (b.lower !== null && b.upper !== null && b.lower === -b.upper) return `±${b.upper}%`;
  const f = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v)}`;
  return `${f(b.lower!)} to ${f(b.upper!)}%`;
}

function OpeningBeat({ reading, units, bands, cities, place, course, gender }: {
  reading: SplitReading; units: UnitSystem; bands: OpeningBand[]; cities: string[]; place: string; course: string; gender: Gender;
}) {
  const band = openingBandOf(reading.opening * 100, bands);
  const params = new URLSearchParams();
  if (band) params.set('opening', band.id);
  if (course !== 'all' && cities.includes(place)) params.set('race', place);
  if (gender !== 'all') params.set('gender', gender === 'men' ? 'Men' : 'Women');
  const href = `/analyses/starting-pace${params.toString() ? `?${params.toString()}` : ''}`;
  const level = Math.abs(reading.opening) < 0.0005;
  return (
    <section className="tool-panel split-check-opening" id="split-check-opening" aria-labelledby="split-check-opening-title">
      <p className="tool-nugget-text" id="split-check-opening-title">
        {level ? <>You ran your first 5K <em>at</em> your {BASE} pace.</>
          : <>You ran your first 5K <em>{openingPct(reading.opening)} {reading.opening < 0 ? 'quicker' : 'slower'}</em> than your {BASE} pace.</>}
      </p>
      {bands.length ? (
        <ol className="split-check-bands" aria-label="The six opening groups, quickest first">
          {bands.map((b) => (
            <li key={b.id} className={band?.id === b.id ? 'is-you' : undefined} aria-current={band?.id === b.id ? 'true' : undefined}>
              <span>{shortBand(b)}</span>
              {band?.id === b.id ? <b>You</b> : null}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="tool-note split-check-more"><Link href={href}>How finishes that opened like this played out</Link></p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison with finishes in your window (Pace Notes data)           */
/* ------------------------------------------------------------------ */

function ComparisonPanel({ comparison, where, genderWord, fallbacks }: {
  comparison: Comparison; where: string; genderWord: string; fallbacks: ReactNode;
}) {
  const ok = comparison.state === 'ok' ? comparison : null;
  return (
    <section className="tool-panel split-check-compare" id="split-check-compare" aria-labelledby="split-check-compare-title">
      <EvidenceTag kind="data" />
      {comparison.state === 'loading' ? <p className="tool-state tool-panel-title" id="split-check-compare-title">Loading the finishes at your time…</p> : null}
      {comparison.state === 'off' ? (
        <div className="tool-state is-error split-check-off">
          <p className="tool-panel-title" id="split-check-compare-title">{comparison.message}</p>
          {comparison.retry ? (
            <div className="tool-share no-print">
              <button type="button" className="btn btn-secondary is-compact" onClick={() => { focusHeading('split-check-compare'); comparison.retry?.(); }}>Try again</button>
              {fallbacks}
            </div>
          ) : null}
        </div>
      ) : null}
      {comparison.state === 'unavailable' ? (
        <div className="split-check-unavailable">
          <p className="tool-panel-title" id="split-check-compare-title">{comparison.title}</p>
          <p className="tool-note">{comparison.message}</p>
          {fallbacks ? <div className="tool-share no-print">{fallbacks}</div> : null}
        </div>
      ) : null}
      {ok ? <ComparisonBody ok={ok} where={where} genderWord={genderWord} fallbacks={fallbacks} /> : null}
    </section>
  );
}

/**
 * The page's one Pace Notes data nugget (the redesign spec, section 7.13): of finishes at this time, how many had a
 * sustained slowdown, as 100 dots. The verdict above says whether this race had one; this says how common it was.
 */
function ComparisonBody({ ok, where, genderWord, fallbacks }: {
  ok: Extract<Comparison, { state: 'ok' }>; where: string; genderWord: string; fallbacks: ReactNode;
}) {
  const { all, held, slow } = ok;
  const sd = all.sd ?? (slow ? slow.n / all.n : null);
  const range = `${formatDuration(ok.lo, true)} to ${formatDuration(ok.hi, true)}`;
  const lit = sd === null ? 0 : Math.round(sd * 100);
  return (
    <>
      {sd !== null ? (
        <>
          <p className="tool-nugget-text" id="split-check-compare-title">
            Of {count(all.n)} finishes from {range} {where}{genderWord ? `, recorded as ${genderWord}` : ''}, <em>{share(sd)}</em> had a <SlowdownTerm />.
          </p>
          <DotGrid lit={lit} label={`${lit} of 100 finishes from ${range} ${where} had a sustained slowdown`} caption={<><strong>{lit} of 100</strong> finishes at your time</>} />
        </>
      ) : (
        <p className="tool-nugget-text" id="split-check-compare-title">{count(all.n)} finishes from {range} {where}{genderWord ? `, recorded as ${genderWord}` : ''}.</p>
      )}
      {(!held || !slow) && fallbacks ? <div className="tool-share no-print">{fallbacks}</div> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pacing type (Pace Notes data: clusters of complete finishes)        */
/* ------------------------------------------------------------------ */

function TypePanel({ reading, type, error, retry, units }: { reading: SplitReading; type: TypeResult; error: string | null; retry: () => void; units: UnitSystem }) {
  if (!type) {
    return (
      <section className="tool-panel split-check-type" id="split-check-type" aria-labelledby="split-check-type-title">
        <EvidenceTag kind="data" />
        {error ? (
          <div className="tool-state is-error split-check-off">
            <p className="tool-panel-title" id="split-check-type-title">{error === 'missing' ? 'The pacing types are not part of this build.' : `${error}`} Everything else on this page still applies.</p>
            {error !== 'missing' ? <div className="tool-share no-print"><button type="button" className="btn btn-secondary is-compact" onClick={() => { focusHeading('split-check-type'); retry(); }}>Try again</button></div> : null}
          </div>
        ) : <p className="tool-state tool-panel-title" id="split-check-type-title">Loading the pacing types…</p>}
      </section>
    );
  }
  const { arch } = type;
  return (
    <section className="tool-panel split-check-type" id="split-check-type" aria-labelledby="split-check-type-title" style={typeStyle(type.index) as CSSProperties}>
      <EvidenceTag kind="data" />
      <div className="tool-panel-head">
        <p className="tool-nugget-text" id="split-check-type-title">The shape of your race: <em>{type.name}</em>, like {share(arch.share)} of finishes.</p>
        {/* The mats in the site's grammar ("25K", "30–40K"), whatever the data file says. */}
        <p className="tool-panel-meta">{arch.blurb.replace(/(\d+)–(\d+) km\b/g, '$1–$2K').replace(/(\d+) km\b/g, '$1K')}</p>
      </div>
      <ProfileChart reading={reading} arch={arch} units={units} />
    </section>
  );
}

/** Your section paces against your own average, beside the median of your pacing type and its middle half. */
function ProfileChart({ reading, arch, units }: { reading: SplitReading; arch: Archetype; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const H = narrow ? 170 : 210;
  const m = { l: 48, r: narrow ? 60 : 76, t: 12, b: 24 };
  const mids = SECTION_BOUNDS.map(([a, b]) => (a + b) / 2);
  const you = reading.relative;
  const values = [...you, ...arch.profile_p25, ...arch.profile_p75, 0];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = Math.max(maxV - minV, 4);
  const tick = [2, 5, 10, 20, 25, 50].find((s) => span / s <= 4) ?? 50;
  const lo = Math.floor(minV / tick) * tick;
  const hi = Math.ceil(maxV / tick) * tick;
  const iw = Math.max(40, width - m.l - m.r);
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(v);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(mids[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const band = `${line(arch.profile_p25)} ${[...arch.profile_p75].reverse().map((v, j) => `L${x(mids[8 - j]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} Z`;
  const ends = [{ key: 'you', text: 'You', ly: y(you[8]) }, { key: 'type', text: 'Typical', ly: y(arch.profile[8]) }].sort((a, b) => a.ly - b.ly);
  if (ends[1].ly - ends[0].ly < 16) ends[1].ly = ends[0].ly + 16;
  const xTicks = fitTicks([0, 10, 20, 30, 40].map((km) => ({ x: x(km), label: km ? `${km}K` : 'Start' })), width);
  return (
    <div ref={ref} className="split-check-profile">
      <svg width={width} height={H} role="img"
        aria-label={`Each section's pace against your own average pace, beside the typical ${arch.name}. You: ${you.map((v, i) => `${secName(i)} ${signedPct(v, 1)}`).join(', ')}. Typical ${arch.name}: ${arch.profile.map((v, i) => `${secName(i)} ${signedPct(v, 1)}`).join(', ')}.`}>
        {ticks.map((v) => (
          <g key={v} className="split-check-gridline">
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0'}%</text>
          </g>
        ))}
        {xTicks.map((t) => <text key={t.label} className="split-check-tick" x={t.x} y={H - 4} textAnchor={t.anchor}>{t.label}</text>)}
        <path className="split-check-type-band" d={band} />
        <path className="split-check-type-line" d={line(arch.profile)} />
        <path className="split-check-you-line" d={line(you)} />
        {you.map((v, i) => <circle key={i} className="split-check-you-dot" cx={x(mids[i])} cy={y(v)} r={3} />)}
        {ends.map((e) => <text key={e.key} x={m.l + iw + 8} y={e.ly + 4} className={`split-check-end is-${e.key}`}>{e.text}</text>)}
      </svg>

    </div>
  );
}
