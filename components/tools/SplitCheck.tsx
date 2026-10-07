'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, EvidencePanel, ShareBar, Stat } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight, type Archetype, type Archetypes } from '@/lib/insights';
import { loadShard, type PaceBandGroup, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { MARATHON_KM, MATS_KM, perUnit } from '@/lib/tools/pace';
import { SECTION_KM, SECTION_NAMES, classify, readSplits, validateSplits, type SplitReading } from '@/lib/tools/splits';
import { formatDuration, parseDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';
import { SECTION_BOUNDS, count, sectionLabel, signedPct } from '@/lib/viz/format';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const INDEX_PATH = 'tools/pace-band.json';
const ARCHETYPES_PATH = 'archetypes.json';
const CHECKPOINTS = [...MATS_KM, MARATHON_KM];
const HELD = '#2F5BFF';
const SLOW = '#FF5B2E';
/** A made-up race that shows every part of the tool: a quick opening and a sustained slowdown from 30 km. */
const EXAMPLE = '0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31';
const DEFAULTS = { s: EXAMPLE, course: 'all', g: 'all' };
const EPS = 1e-12;
/** Text-weight versions of the pacing-type colours, for lines and labels on the cream card. */
const TYPE_INK = ['#0B7A52', '#2346E6', '#8A5A00', '#5B34D6', '#B3123E', '#B4380D'];

type Gender = 'all' | 'men' | 'women';
const GENDER_OPTIONS: { value: Gender; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }];

/** One of the six opening groups of the starting-pace analysis (first 5 km vs the same race's 5–20 km pace, in %). */
export interface OpeningBand { id: string; label: string; lower: number | null; upper: number | null; lower_inclusive: boolean; upper_inclusive: boolean }

interface Cell { n: number; ed: number; e50: number[]; s50: number[]; sd?: number }

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * One elapsed mat time as trackers print it. Three groups are h:mm:ss. Two groups are mm:ss when the first is 10 or more
 * ("25:50") and h:mm below 10 ("3:58"): no marathon mat is passed in under ten minutes. Also "2h05m31s" and keypad dots.
 */
export function parseMatTime(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const colon = text.match(/^(\d{1,3}(?::\d{1,2}){1,2})(?:\.(\d{1,3}))?$/);
  if (colon) {
    const parts = colon[1].split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    const fraction = colon[2] ? Number(`0.${colon[2]}`) : 0;
    if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2] + fraction);
    const [a, b] = parts;
    return a >= 10 ? Math.round(a * 60 + b + fraction) : a * 3600 + b * 60;
  }
  const keypad = text.match(/^(\d{1,3})[.,](\d{2})$/);
  if (keypad) {
    const [a, b] = [Number(keypad[1]), Number(keypad[2])];
    if (b >= 60) return null;
    return a >= 10 ? a * 60 + b : a * 3600 + b * 60;
  }
  const seconds = parseDuration(text, 'race');
  return seconds !== null && seconds > 0 ? Math.round(seconds) : null;
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
const FINISH_RE = /\b(?:finish|fin|final|ziel|zielzeit|netto|net\s*time|chip\s*time|arriv[ée]e|llegada)\b|\b42[.,]\d*\s*(?:k|km)\b|\b26[.,]2\s*mi/i;
const HALF_RE = /\b(?:half|halfway|halb|hm|semi|mitad|21[.,]1\d*|13[.,]1)\b/i;

export interface PasteResult { times: (number | null)[]; found: number; labelled: boolean; tokens: number; skippedHalf?: boolean }

/**
 * Read nine mat times from pasted tracker or results text. Lines labelled 5K…40K and Finish are matched by label (halfway and
 * mile lines are ignored, and the first plausible time on each line wins); unlabelled text must hold exactly nine times in order.
 */
export function readPasted(text: string): PasteResult {
  // Every plausible time on each labelled line, in order (a results table may also hold time of day and section times).
  const candidates: number[][] = CHECKPOINTS.map(() => []);
  const seen = new Set<number>();
  let labelled = false;
  for (const raw of text.split(/[\n;|]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const mat = line.match(MAT_RE);
    let index = -1;
    if (mat) index = MATS_KM.indexOf(Number(mat[1]) as (typeof MATS_KM)[number]);
    else if (FINISH_RE.test(line) && !HALF_RE.test(line)) index = 8;
    if (index < 0) continue;
    labelled = true;
    if (seen.has(index)) continue;
    seen.add(index);
    const km = CHECKPOINTS[index];
    for (const token of timeTokens(mat ? line.slice((mat.index ?? 0) + mat[0].length) : line)) {
      const s = parseMatTime(token);
      if (s !== null && s / km >= 120 && s / km <= 1200 && !candidates[index].includes(s)) candidates[index].push(s);
    }
  }
  const times = chooseSequence(candidates);
  const found = times.filter((t) => t !== null).length;
  if (labelled && found) return { times, found, labelled: true, tokens: found };
  const tokens = timeTokens(text).map(parseMatTime).filter((t): t is number => t !== null);
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
  return CHECKPOINTS.map((_, i) => (parts[i] ? parseMatTime(parts[i]) : null));
};
const displayTime = (t: number | null) => (t === null ? '' : formatDuration(t));

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const fmtPace = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;
const unitWord = (units: UnitSystem) => (units === 'mi' ? 'mile' : 'km');
const qualifies = (frac: number) => frac + EPS >= 0.25;
/** "27%"; one decimal when rounding would hide which side of 25% a value is on, or round a real change to 0%. */
function pctAbs(frac: number): string {
  const p = frac * 100;
  const r = Math.round(Math.abs(p));
  if ((r >= 25) !== qualifies(Math.abs(frac)) || (r === 0 && Math.abs(p) >= 0.05)) return `${Math.abs(p).toFixed(1)}%`;
  return `${r}%`;
}
const pctSigned = (frac: number) => signedPct(frac * 100, 1);
const editions = (k: number) => (k === 1 ? 'one edition' : `${count(k)} editions`);
const share = (v: number) => `${(v * 100).toFixed(1)}%`;
/** Section name in the selected units ("30–35 km" or "18.6–21.7 mi"). */
const secName = (i: number, units: UnitSystem) => (units === 'mi' ? sectionLabel(i, 'mi') : `${SECTION_NAMES[i]} km`);
const baseName = (units: UnitSystem) => (units === 'mi' ? '3.1–12.4 mi' : '5–20 km');
const matName = (km: number, units: UnitSystem) => (km >= 42.19 ? 'Finish' : units === 'mi' ? `${(km / KM_PER_MILE).toFixed(1)} mi` : `${km} km`);
function ahead(seconds: number): string {
  const s = Math.round(seconds);
  if (s === 0) return 'level';
  return `${formatDuration(Math.abs(s))} ${s < 0 ? 'ahead' : 'behind'}`;
}
/** "6:11 ahead of", "1:38 behind", "level with": the words before a group name. */
function relation(seconds: number): { time: string | null; words: string } {
  const s = Math.round(seconds);
  if (s === 0) return { time: null, words: 'level with' };
  return { time: formatDuration(Math.abs(s)), words: s < 0 ? 'ahead of' : 'behind' };
}

type Tone = 'quick' | 'even' | 'slow' | 'qualify';
/** Bar category: a qualifying section is a 5 km section after 20 km at least 25% slower, or the final 2.195 km extending one. */
function toneOf(r: SplitReading, i: number): Tone {
  const v = r.vsBaseline[i];
  if (i >= 4 && i <= 7 && qualifies(v)) return 'qualify';
  if (i === 8 && qualifies(v) && qualifies(r.vsBaseline[7])) return 'qualify';
  if (v <= -0.02) return 'quick';
  if (v < 0.02) return 'even';
  return 'slow';
}
const TONE: Record<Tone, { fill: string; stroke: string; label: string }> = {
  quick: { fill: '#9DB6FB', stroke: '#2346E6', label: 'Quicker than 5–20 km pace' },
  even: { fill: '#DCD3C2', stroke: '#66625A', label: 'Within 2%' },
  slow: { fill: '#FFC7AA', stroke: '#E0571F', label: 'Slower' },
  qualify: { fill: '#FF5B2E', stroke: '#B4380D', label: '25% or more slower after 20 km' },
};

/** Plain-language summary: the slowdown verdict first, then the slowest section and the opening. */
function summarize(r: SplitReading, units: UnitSystem): { lead: string; more: string[] } {
  const base = baseName(units);
  const five = units === 'mi' ? '3.1 mi' : '5 km';
  const after20 = units === 'mi' ? 'after 12.4 mi' : 'after 20 km';
  const vs = r.vsBaseline;
  const more: string[] = [];
  let worst = 4;
  for (let i = 5; i < 8; i += 1) if (vs[i] > vs[worst]) worst = i;
  let lead: string;
  if (r.slowdown && r.onsetKm !== null) {
    const i0 = (r.onsetKm - 20) / 5 + 4;
    const at = units === 'mi' ? `${(r.onsetKm / KM_PER_MILE).toFixed(1)} mi (the ${r.onsetKm} km mat)` : `${r.onsetKm} km`;
    lead = `Your ${secName(i0, units)} section was ${pctAbs(vs[i0])} slower than your ${base} pace: a sustained slowdown starting at ${at}.`;
    if (worst !== i0) more.push(`Your slowest section was ${secName(worst, units)}, ${pctAbs(vs[worst])} slower.`);
  } else {
    const v = vs[worst];
    if (v >= 0.02) lead = `No sustained slowdown. Your slowest ${five} ${after20}, ${secName(worst, units)}, was ${pctAbs(v)} slower than your ${base} pace, ${v < 0.15 ? 'well ' : ''}short of the 25% threshold.`;
    else if (v > -0.02) lead = `No sustained slowdown: every ${five} section ${after20} stayed within 2% of your ${base} pace or quicker.`;
    else lead = `No sustained slowdown: you ran every ${five} section ${after20} quicker than your ${base} pace.`;
    if (qualifies(vs[8])) more.push(`Your final ${units === 'mi' ? '1.4 mi' : '2.2 km'} was ${pctAbs(vs[8])} slower, but the last 2.195 km cannot count as a sustained slowdown on its own.`);
  }
  const o = r.opening;
  more.push(Math.abs(o) < 0.0005 ? `You ran the first ${five} at your ${base} pace.` : `You ran the first ${five} ${pctAbs(o)} ${o < 0 ? 'quicker' : 'slower'} than that pace.`);
  return { lead, more };
}

/* ------------------------------------------------------------------ */
/* Data hooks                                                          */
/* ------------------------------------------------------------------ */

function useVerified<T>(path: string, sha: string | null): { data: T | null; error: boolean } {
  const [state, setState] = useState<{ data: T | null; error: boolean }>({ data: null, error: false });
  useEffect(() => {
    if (!sha) return;
    let live = true;
    loadInsight<T>(path, sha).then((data) => { if (live) setState({ data, error: false }); }, () => { if (live) setState({ data: null, error: true }); });
    return () => { live = false; };
  }, [path, sha]);
  return sha ? state : { data: null, error: true };
}

function useShard(index: PaceBandIndex | null, path: string) {
  const [state, setState] = useState<{ path: string; data: PaceBandShard | null; error: boolean } | null>(null);
  const listed = Boolean(index?.shards?.[path]);
  useEffect(() => {
    if (!index || !listed) return;
    let live = true;
    loadShard<PaceBandShard>(index, path).then((data) => { if (live) setState({ path, data, error: false }); }, () => { if (live) setState({ path, data: null, error: true }); });
    return () => { live = false; };
  }, [index, path, listed]);
  return state && state.path === path ? state : null;
}

function cellOf(group: PaceBandGroup | undefined, minute: number): Cell | null {
  if (!group) return null;
  const i = group.g.indexOf(minute);
  if (i < 0) return null;
  return { n: group.n[i], ed: group.ed[i], e50: group.e50[i], s50: group.s50[i], sd: group.sd?.[i] };
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

type Comparison =
  | { state: 'off'; message: string }
  | { state: 'loading' }
  | { state: 'unavailable'; title: string; message: string }
  | { state: 'ok'; minute: number; lo: number; hi: number; all: Cell; held: Cell | null; slow: Cell | null };

export default function SplitCheck({ indexSha, archetypesSha, openingBands, openingCities }: {
  indexSha: string | null; archetypesSha: string | null; openingBands: OpeningBand[]; openingCities: string[];
}) {
  const { units } = useUnits();
  const [q, setQ, ready] = useQueryState(DEFAULTS);
  const [texts, setTexts] = useState<string[]>(() => fromQuery(EXAMPLE).map(displayTime));
  const [touched, setTouched] = useState<boolean[]>(() => Array(9).fill(false));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const formId = useId();

  // The URL is read once after mount; the nine fields follow it then, and every edit is mirrored back.
  useEffect(() => {
    if (ready) setTexts(fromQuery(q.s).map(displayTime));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const parsed = useMemo(() => texts.map(parseMatTime), [texts]);
  const setTimes = (next: (number | null)[]) => {
    setTexts(next.map(displayTime));
    setTouched(Array(9).fill(false));
    setQ({ s: serialize(next) });
  };
  const editField = (i: number, value: string) => {
    const next = texts.map((t, k) => (k === i ? value : t));
    setTexts(next);
    setQ({ s: serialize(next.map(parseMatTime)) });
  };
  const blurField = (i: number) => {
    setTouched((prev) => prev.map((v, k) => (k === i ? true : v)));
    const s = parsed[i];
    if (s !== null) setTexts((prev) => prev.map((t, k) => (k === i ? displayTime(s) : t)));
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
  const fieldProblem = parsed.map((t, i): string | null => {
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
  const unreadable = fieldProblem.findIndex((p) => p === 'unreadable');
  const complete = entered === 9;
  const problem = complete ? validateSplits(parsed) : null;
  const times = complete && !problem ? (parsed as number[]) : null;
  const reading = useMemo(() => (times ? readSplits(times) : null), [times]);
  const isExample = q.s === EXAMPLE;

  // Verified data: the pace-band index and one shard per course and recorded gender; the pacing-type classifier.
  const index = useVerified<PaceBandIndex>(INDEX_PATH, indexSha);
  const archetypes = useVerified<Archetypes>(ARCHETYPES_PATH, archetypesSha);
  const gender: Gender = q.g === 'men' || q.g === 'women' ? q.g : 'all';
  const shardPath = `tools/pace-band/${q.course}/${gender}.json`;
  const shard = useShard(index.data, shardPath);
  const scope = index.data?.scopes.find((s) => s.slug === q.course) ?? null;
  const place = q.course === 'all' ? 'all courses' : scope?.city ?? q.course;
  const where = q.course === 'all' ? 'on all courses' : `in ${place}`;
  const genderWord = gender === 'all' ? '' : gender;

  const comparison: Comparison = useMemo(() => {
    if (!times) return { state: 'loading' };
    if (index.error) return { state: 'off', message: indexSha ? 'The comparison data could not be loaded or verified. Your own splits above are unaffected.' : 'The comparison data is not part of this build. Your own splits above are unaffected.' };
    if (!index.data) return { state: 'loading' };
    if (!scope) return { state: 'unavailable', title: 'Course not found.', message: 'That course is not in the data. Choose another, or All courses.' };
    const [g0, g1] = index.data.goals;
    const minute = Math.floor(times[8] / 60) + 3;
    if (minute < g0 || minute > g1) {
      return { state: 'unavailable', title: 'Outside the compared range.', message: `Comparison windows cover finishes from ${formatDuration((g0 - 3) * 60, true)} to ${formatDuration((g1 - 2) * 60 - 1, true)}. Your section paces, slowdown reading and pacing type above still apply.` };
    }
    if (!scope.genders[gender] || !index.data.shards?.[shardPath]) {
      return { state: 'unavailable', title: 'Not published for this selection.', message: `No finish window ${where} has 100 finishes recorded as ${genderWord || 'any gender'}, so nothing is shown.` };
    }
    if (!shard) return { state: 'loading' };
    if (shard.error || !shard.data) return { state: 'off', message: 'This course and gender could not be loaded or verified. Try again, or choose All courses.' };
    const windowS = shard.data.window_s || index.data.window_s || 300;
    const lo = minute * 60 - windowS;
    const hi = minute * 60 - 1;
    const all = cellOf(shard.data.groups.all, minute);
    if (!all) return { state: 'unavailable', title: 'Too few finishes at your time.', message: `Fewer than 100 complete finishes ran ${formatDuration(lo, true)} to ${formatDuration(hi, true)} ${where}${genderWord ? ` (recorded as ${genderWord})` : ''}, so this window is not published.` };
    return { state: 'ok', minute, lo, hi, all, held: cellOf(shard.data.groups.held, minute), slow: cellOf(shard.data.groups.slowdown, minute) };
  }, [times, index, indexSha, scope, gender, shardPath, shard, where, genderWord]);

  const type = useMemo(() => {
    if (!reading || !archetypes.data) return null;
    const c = archetypes.data.classifier;
    const k = classify(reading.relative, c);
    const name = c.names[k];
    const at = archetypes.data.archetypes.findIndex((a) => a.name === name);
    const arch = archetypes.data.archetypes[at >= 0 ? at : k];
    return { name, arch, colour: ARCHETYPE_COLOURS[(at >= 0 ? at : k) % ARCHETYPE_COLOURS.length], all: archetypes.data.archetypes };
  }, [reading, archetypes.data]);

  const fallbacks = (
    <div className="split-check-actions">
      {q.course !== 'all' ? <button type="button" className="button-secondary" onClick={() => setQ({ course: 'all' })}>Switch to All courses</button> : null}
      {gender !== 'all' ? <button type="button" className="button-secondary" onClick={() => setQ({ g: 'all' })}>Switch to all genders</button> : null}
    </div>
  );

  const hintId = `${formId}-grid-hint`;
  const gridMessage = unreadable >= 0
    ? `Couldn’t read the ${unreadable === 8 ? 'finish' : `${CHECKPOINTS[unreadable]} km`} time. Use h:mm:ss (1:45:54), or mm:ss before the first hour (25:50).`
    : !complete ? (entered ? `${entered} of 9 entered. Every mat is needed; gaps are never filled in.` : 'Type or paste your nine mat times.')
    : problem;

  return (
    <div className="split-check-root">
      <div className="tool-workspace">
        <form className="tool-inputs split-check-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Split check inputs">
          <h2>Your nine mat times</h2>
          {isExample ? <p className="split-check-example">Example race. Type over it or paste your own; results update as you type.</p> : null}

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
              const bad = fieldProblem[i] !== null && (fieldProblem[i] !== 'unreadable' || touched[i] || texts[i].length > 4);
              return (
                <div key={km} className={`split-check-cell${i === 8 ? ' is-finish' : ''}`}>
                  <label htmlFor={`${formId}-t${i}`}>
                    <span>{i === 8 ? 'Finish' : `${km} km`}</span>
                    <small>{i === 8 ? (units === 'mi' ? '26.2 mi' : '42.2 km') : units === 'mi' ? `${(km / KM_PER_MILE).toFixed(1)} mi` : ' '}</small>
                  </label>
                  <input id={`${formId}-t${i}`} inputMode="decimal" autoComplete="off" spellCheck={false} value={texts[i]}
                    placeholder={i < 2 ? 'mm:ss' : 'h:mm:ss'} aria-invalid={bad || undefined} aria-describedby={hintId}
                    onChange={(e) => editField(i, e.target.value)} onBlur={() => blurField(i)} />
                </div>
              );
            })}
          </fieldset>
          <p className={`tool-field-hint${(unreadable >= 0 && touched[unreadable]) || problem ? ' is-error' : ''}`} id={hintId}>
            {gridMessage ?? 'Elapsed chip time at each mat: h:mm:ss, or mm:ss before the first hour.'}
          </p>
          <div className="split-check-buttons">
            <button type="button" className="button-secondary" onClick={() => { setTimes(Array(9).fill(null)); setPasteText(''); setPasteNote(null); }}>Clear</button>
            {!isExample ? <button type="button" className="button-secondary" onClick={() => { setTimes(fromQuery(EXAMPLE)); setPasteText(''); setPasteNote(null); }}>Load the example</button> : null}
          </div>

          <div className="tool-field">
            <label htmlFor={`${formId}-course`}>Compare with finishes on</label>
            <select id={`${formId}-course`} value={q.course} onChange={(e) => setQ({ course: e.target.value })}>
              <option value="all">All courses{index.data ? ` · ${editions(index.data.scopes.find((s) => s.slug === 'all')?.editions ?? 0)}` : ''}</option>
              {index.data ? index.data.scopes.filter((s) => s.slug !== 'all').map((s) => <option key={s.slug} value={s.slug}>{s.city ?? s.slug} · {editions(s.editions)}</option>)
                : q.course !== 'all' ? <option value={q.course}>{q.course}</option> : null}
            </select>
            <p className="tool-field-hint">Race not listed? All courses compares you with finishes from other races.</p>
          </div>
          <div className="tool-field">
            <span className="tool-label" id={`${formId}-gender`}>Recorded gender <span className="split-check-optional">optional</span></span>
            <div role="group" aria-labelledby={`${formId}-gender`}><Choice label="Recorded gender" value={gender} onChange={(v) => setQ({ g: v })} options={GENDER_OPTIONS} small /></div>
          </div>
          <p className="tool-field-hint split-check-privacy">Your times stay in this browser. They sit in the page address only so you can share a link; nothing is sent or recorded.</p>
        </form>

        <div className="tool-results">
          {!reading || !times ? (
            <div className={problem ? 'tool-state is-error' : 'tool-empty'} role={problem ? 'alert' : undefined}>
              {problem ? <><strong>Check your times.</strong> {problem}</> : <>Enter all nine elapsed times (5, 10, 15, 20, 25, 30, 35 and 40 km, and the finish) to read your race. {entered ? `${entered} of 9 so far.` : ''} Missing mats are never estimated.</>}
            </div>
          ) : (
            <Results times={times} reading={reading} units={units} comparison={comparison} type={type} typeError={archetypes.error}
              where={where} place={place} genderWord={genderWord} course={q.course} gender={gender} fallbacks={fallbacks}
              openingBands={openingBands} openingCities={openingCities} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

type TypeResult = { name: string; arch: Archetype; colour: string; all: Archetype[] } | null;

function Results({ times, reading, units, comparison, type, typeError, where, place, genderWord, course, gender, fallbacks, openingBands, openingCities }: {
  times: number[]; reading: SplitReading; units: UnitSystem; comparison: Comparison; type: TypeResult; typeError: boolean;
  where: string; place: string; genderWord: string; course: string; gender: Gender; fallbacks: ReactNode; openingBands: OpeningBand[]; openingCities: string[];
}) {
  const { lead, more } = summarize(reading, units);
  const avg = times[8] / MARATHON_KM;
  const onsetIndex = reading.onsetKm !== null ? (reading.onsetKm - 20) / 5 + 4 : null;
  return (
    <>
      <div className="tool-headline split-check-headline" aria-live="polite">
        <div className="split-check-summary">
          <p className="split-check-lead">{lead}</p>
          {more.length ? <p className="split-check-more">{more.join(' ')}</p> : null}
        </div>
        <Stat label="Finish" value={formatDuration(times[8], true)} sub={`average ${fmtPace(avg, units)}`} />
        <Stat label="5–20 km pace" value={formatDuration(perUnit(reading.baseline, units))}
          sub={`per ${unitWord(units)}${units === 'mi' ? ' (3.1–12.4 mi)' : ''} · 25% slower is ${fmtPace(reading.baseline * 1.25, units)}`} />
        <Stat label="Sustained slowdown" value={reading.slowdown ? 'Yes' : 'No'} tone={reading.slowdown ? 'bad' : 'good'}
          sub={reading.slowdown && onsetIndex !== null ? `from ${units === 'mi' ? `${(reading.onsetKm! / KM_PER_MILE).toFixed(1)} mi (${reading.onsetKm} km)` : `${reading.onsetKm} km`} · published definition` : 'published definition: ≥25% for ≥5 km after 20 km'} />
        <div className="tool-stat split-check-type-stat">
          <span className="tool-stat-label">Pacing type</span>
          <strong className="tool-stat-value">{type ? <><i style={{ background: type.colour }} aria-hidden="true" />{type.name}</> : typeError ? '—' : '…'}</strong>
          <span className="tool-stat-sub">{type ? 'nearest of six published shapes' : typeError ? 'classifier unavailable' : 'loading the classifier'}</span>
        </div>
      </div>

      <EvidencePanel kind="arithmetic" title="Your race, section by section" id="split-check-sections"
        meta={`Pace in each section against your own ${baseName(units)} pace (${fmtPace(reading.baseline, units)}), the reference block in the published definition. Bars show how much slower or quicker each section was.`}>
        <SectionChart reading={reading} times={times} units={units} />
        <SectionTable reading={reading} times={times} units={units} />
      </EvidencePanel>

      <div className="split-check-pair">
        <SlowdownPanel reading={reading} units={units} />
        <OpeningPanel reading={reading} units={units} bands={openingBands} cities={openingCities} place={place} course={course} gender={gender} />
      </div>

      <ComparisonPanel comparison={comparison} times={times} units={units} where={where} course={course} genderWord={genderWord} fallbacks={fallbacks} />

      <TypePanel reading={reading} type={type} error={typeError} units={units} />

      <div className="print-only split-check-print">
        <p>Pace Notes split check. Mat times entered: {CHECKPOINTS.map((km, i) => `${i === 8 ? 'Finish' : `${km} km`} ${formatDuration(times[i], true)}`).join(' · ')}.</p>
      </div>

      <div className="tool-callout no-print">
        <strong>Next race?</strong> Turn a goal into a wristband beside the mat times of finishes that hit it with the <Link href={`/tools/pace-band?goal=${formatHMGoal(times[8])}${course !== 'all' ? `&course=${course}` : ''}`}>pace band</Link>, see how openings like yours played out in <Link href="/analyses/starting-pace">starting pace</Link>, and meet all six shapes in <Link href="/stories/pacing-types">six ways to run the same race</Link>.
      </div>
      <ShareBar />
    </>
  );
}

/** Whole-minute goal for the pace band link: your finish rounded down. */
function formatHMGoal(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Section chart (arithmetic)                                          */
/* ------------------------------------------------------------------ */

function SectionChart({ reading, times, units }: { reading: SplitReading; times: number[]; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const [hover, setHover] = useState<number | null>(null);
  const narrow = width < 480;
  const H = narrow ? 280 : 320;
  const m = { l: 50, r: 8, t: 30, b: 30 };
  const toU = (s: number) => perUnit(s, units);
  const B = toU(reading.baseline);
  const T = B * 1.25;
  const paces = reading.paces.map(toU);
  const minV = Math.min(...paces, B);
  const maxV = Math.max(...paces, T);
  const span0 = maxV - minV;
  const tick = [5, 10, 15, 20, 30, 60, 120, 300].find((s) => span0 / s <= 5) ?? 300;
  const lo = Math.floor((minV - span0 * 0.06) / tick) * tick;
  const hi = Math.ceil((maxV + span0 * 0.1) / tick) * tick;
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih; // quicker paces at the top
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(v);
  const yB = y(B);
  const yT = y(T);
  const gap = narrow ? 1.5 : 3;

  // Percentage labels at the end of each bar, nudged apart when neighbours collide.
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const boxes: Box[] = [];
  const labels = reading.vsBaseline.map((v, i) => {
    const [a, b] = SECTION_BOUNDS[i];
    const cx = (x(a) + x(b)) / 2;
    const yp = y(paces[i]);
    const whole = Math.round(Math.abs(v * 100));
    const text = narrow || Math.abs(v) >= 0.1 ? (whole === 0 ? '0%' : `${v > 0 ? '+' : '−'}${whole}%`) : pctSigned(v);
    const w = text.length * 6.3;
    const down = v >= 0;
    let ly = down ? Math.max(yp, yB) + 13 : Math.min(yp, yB) - 5;
    if (down && ly > m.t + ih - 2) ly = Math.max(yp, yB) - 4;
    for (let k = 0; k < 6; k += 1) {
      const box = { x0: cx - w / 2, x1: cx + w / 2, y0: ly - 10, y1: ly + 2 };
      if (!boxes.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) { boxes.push(box); break; }
      ly += down ? 12 : -12;
    }
    return { i, cx, ly, text, tone: toneOf(reading, i) };
  });

  const xTicks = units === 'mi' ? (narrow ? [0, 5, 10, 15, 20, 25] : [0, 5, 10, 15, 20, 25]).map((mi) => ({ km: mi * KM_PER_MILE, label: String(mi) }))
    : (narrow ? [0, 10, 20, 30, 40] : [0, 5, 10, 15, 20, 25, 30, 35, 40]).map((km) => ({ km, label: String(km) }));
  const pick = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const km = ((clientX - box.left - m.l) / iw) * MARATHON_KM;
    const i = SECTION_BOUNDS.findIndex(([a, b]) => km >= a && km < b);
    setHover(i < 0 ? (km < 0 ? 0 : 8) : i);
  };
  const qualifying = reading.vsBaseline.map((v, i) => (i >= 4 && i <= 7 && qualifies(v) ? secName(i, units) : null)).filter(Boolean);
  const aria = `Section pace chart. Your ${baseName(units)} pace is ${fmtPace(reading.baseline, units)}; 25% slower is ${fmtPace(reading.baseline * 1.25, units)}. `
    + reading.paces.map((p, i) => `${secName(i, units)}: ${fmtPace(p, units)}, ${pctSigned(reading.vsBaseline[i])}`).join('; ')
    + `. ${qualifying.length ? `At least 25% slower after 20 km: ${qualifying.join(', ')}.` : 'No 5 km section after 20 km was 25% or more slower.'}`;
  const tipX = hover === null ? 0 : Math.min(width - 96, Math.max(96, (x(SECTION_BOUNDS[hover][0]) + x(SECTION_BOUNDS[hover][1])) / 2));
  const after = units === 'mi' ? 'after 12.4 mi (20 km)' : 'after 20 km';

  return (
    <>
      <div className="legend-row split-check-legend" aria-hidden="true">
        <span><i className="swatch" style={{ background: TONE.quick.fill, boxShadow: `inset 0 0 0 1px ${TONE.quick.stroke}` }} />Quicker</span>
        <span><i className="swatch" style={{ background: TONE.slow.fill, boxShadow: `inset 0 0 0 1px ${TONE.slow.stroke}` }} />Slower</span>
        <span><i className="swatch" style={{ background: TONE.qualify.fill, boxShadow: `inset 0 0 0 1px ${TONE.qualify.stroke}` }} />≥25% slower after 20 km</span>
        <span><i className="split-check-key-pill is-base">{formatDuration(perUnit(reading.baseline, units))}</i>{baseName(units)} pace</span>
        <span><i className="split-check-key-pill is-threshold">{formatDuration(perUnit(reading.baseline * 1.25, units))}</i>25% slower</span>
        <span><i className="split-check-key-zone" />Slowdown zone</span>
      </div>
      <div ref={ref} className="viz split-check-chart" onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label={aria}>
          <defs>
            <pattern id="split-check-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="rgba(255, 91, 46, 0.06)" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255, 91, 46, 0.22)" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x={x(20)} y={yT} width={x(MARATHON_KM) - x(20)} height={Math.max(0, m.t + ih - yT)} fill="url(#split-check-hatch)" />
          <line x1={x(20)} x2={x(20)} y1={m.t - 4} y2={m.t + ih} stroke="var(--line-2)" strokeDasharray="2 3" />
          <text x={x(20) + 5} y={m.t - 10} className="annotation-sub">{after} →</text>
          {ticks.map((v) => (
            <g key={v} className="grid">
              <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
              {Math.abs(y(v) - yB) > 14 && Math.abs(y(v) - yT) > 14 ? <text x={m.l - 7} y={y(v) + 4} textAnchor="end">{formatDuration(v)}</text> : null}
            </g>
          ))}
          <text x={2} y={m.t - 10} className="axis-label">/{units} · quicker ↑</text>
          {xTicks.map((t) => <text key={t.label} x={x(t.km)} y={H - 10} textAnchor="middle">{t.label}</text>)}

          {reading.paces.map((_, i) => {
            const [a, b] = SECTION_BOUNDS[i];
            const yp = y(paces[i]);
            const tone = TONE[toneOf(reading, i)];
            const top = Math.min(yp, yB);
            const h = Math.max(Math.abs(yp - yB), 1.5);
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                <rect x={x(a) + gap} y={top} width={Math.max(2, x(b) - x(a) - 2 * gap)} height={h} fill={tone.fill} rx={1.5} />
                <line x1={x(a) + gap} x2={x(b) - gap} y1={yp} y2={yp} stroke={tone.stroke} strokeWidth={2.4} strokeLinecap="round" />
              </g>
            );
          })}

          <line x1={m.l} x2={width - m.r} y1={yB} y2={yB} stroke="var(--ink)" strokeWidth={1.2} strokeDasharray="5 4" />
          <line x1={x(5)} x2={x(20)} y1={yB} y2={yB} stroke="var(--ink)" strokeWidth={2.6} />
          <line x1={x(20)} x2={width - m.r} y1={yT} y2={yT} stroke="#B4380D" strokeWidth={1.4} strokeDasharray="3 3" />
          <g className="split-check-pill is-base">
            <rect x={2} y={yB - 9} width={m.l - 6} height={18} rx={9} />
            <text x={2 + (m.l - 6) / 2} y={yB + 4} textAnchor="middle">{formatDuration(B)}</text>
          </g>
          <g className="split-check-pill is-threshold">
            <rect x={2} y={yT - 9} width={m.l - 6} height={18} rx={9} />
            <text x={2 + (m.l - 6) / 2} y={yT + 4} textAnchor="middle">{formatDuration(T)}</text>
          </g>

          {labels.map((l) => (
            <text key={l.i} x={l.cx} y={l.ly} textAnchor="middle" className={`split-check-bar-label split-check-halo is-${l.tone}`}>{l.text}</text>
          ))}
          {hover !== null ? <rect x={x(SECTION_BOUNDS[hover][0]) + 0.5} y={m.t} width={x(SECTION_BOUNDS[hover][1]) - x(SECTION_BOUNDS[hover][0]) - 1} height={ih} fill="none" stroke="var(--ink-3)" strokeDasharray="2 3" /> : null}
        </svg>
        {hover !== null ? (
          <div className="viz-tooltip split-check-tip" style={{ left: tipX, top: m.t + 8 }} aria-hidden="true">
            <b>{secName(hover, units)}{units === 'mi' ? ` · ${SECTION_NAMES[hover]} km` : ''}</b>
            <span>Section time {formatDuration(times[hover] - (hover ? times[hover - 1] : 0))}</span>
            <span>Pace {fmtPace(reading.paces[hover], units)}</span>
            <span>{pctSigned(reading.vsBaseline[hover])} vs your {baseName(units)} pace</span>
          </div>
        ) : null}
      </div>
      <p className="split-check-axis-note">{units === 'mi' ? 'Miles from the start' : 'Kilometres from the start'}. Each bar runs from your {baseName(units)} pace to the section’s pace; the last is the final 2.195 km. The hatched zone is 25% or more slower than your {baseName(units)} pace, after 20 km.</p>
    </>
  );
}

function SectionTable({ reading, times, units }: { reading: SplitReading; times: number[]; units: UnitSystem }) {
  return (
    <div className="tool-table-wrap split-check-table-wrap">
      <table className="tool-table split-check-table">
        <thead>
          <tr><th scope="col">Section</th><th scope="col">Time</th><th scope="col">Pace /{units}</th><th scope="col">vs {baseName(units)} pace</th></tr>
        </thead>
        <tbody>
          {reading.paces.map((p, i) => {
            const tone = toneOf(reading, i);
            const v = reading.vsBaseline[i];
            const note = i === 0 ? 'opening' : i >= 1 && i <= 3 ? 'reference' : i === 8 ? 'final 2.195 km' : null;
            return (
              <tr key={i} className={`${i >= 1 && i <= 3 ? 'is-base' : ''}${tone === 'qualify' ? ' is-qualify' : ''}`.trim() || undefined}>
                <th scope="row"><span className="split-check-sec">{secName(i, units)}</span><span className="split-check-sub">{units === 'mi' ? `${SECTION_NAMES[i]} km` : ''}{units === 'mi' && note ? ' · ' : ''}{note ?? ''}</span></th>
                <td>{formatDuration(times[i] - (i ? times[i - 1] : 0))}</td>
                <td>{formatDuration(perUnit(p, units))}</td>
                <td className={v >= 0.02 ? 'is-plus' : v <= -0.02 ? 'is-minus' : undefined}>
                  {pctSigned(v)}{tone === 'qualify' ? <span className="split-check-flag">≥25%</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><th scope="row">{baseName(units)} pace</th><td>{formatDuration(times[3] - times[0])}</td><td>{formatDuration(perUnit(reading.baseline, units))}</td><td>—</td></tr>
          <tr><th scope="row">Whole race</th><td>{formatDuration(times[8], true)}</td><td>{formatDuration(perUnit(times[8] / MARATHON_KM, units))}</td><td>{pctSigned(times[8] / MARATHON_KM / reading.baseline - 1)}</td></tr>
        </tfoot>
        <caption>Arithmetic on your times: section time ÷ section length. Positive is slower than your {baseName(units)} pace. Mats only: no halfway or mile splits are derived.</caption>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sustained slowdown (published research definition)                  */
/* ------------------------------------------------------------------ */

function SlowdownPanel({ reading, units }: { reading: SplitReading; units: UnitSystem }) {
  const sections = [4, 5, 6, 7, 8];
  let run = 0;
  if (reading.onsetKm !== null) {
    for (let i = (reading.onsetKm - 20) / 5 + 4; i < 9 && qualifies(reading.vsBaseline[i]); i += 1) run += SECTION_KM[i];
  }
  const title = reading.slowdown && reading.onsetKm !== null
    ? <>Sustained slowdown: yes, from {units === 'mi' ? `${(reading.onsetKm / KM_PER_MILE).toFixed(1)} mi` : `${reading.onsetKm} km`}</>
    : <>Sustained slowdown: no</>;
  return (
    <EvidencePanel kind="research" title={title} id="split-check-slowdown"
      meta="A 5 km section after 20 km at least 25% slower than your own 5–20 km pace, with contiguous slow sections totalling at least 5 km.">
      <ol className="split-check-steps">
        {sections.map((i) => {
          const v = reading.vsBaseline[i];
          const yes = i < 8 ? qualifies(v) : false;
          const ext = i === 8 && qualifies(v) && qualifies(reading.vsBaseline[7]);
          return (
            <li key={i} className={yes || ext ? 'is-yes' : undefined}>
              <span className="split-check-step-name">{secName(i, units)}</span>
              <span className="split-check-step-value">{pctSigned(v)}</span>
              <span className="split-check-step-verdict">{yes ? '≥25%: qualifies' : i === 8 ? (ext ? 'extends the run' : qualifies(v) ? '≥25%, cannot count alone' : 'cannot count alone') : 'under 25%'}</span>
            </li>
          );
        })}
      </ol>
      <p className="tool-note">
        {reading.slowdown
          ? <>Slow sections in a row: {run.toLocaleString('en-US', { maximumFractionDigits: 3 })} km from the {reading.onsetKm} km mat. </>
          : null}
        Applying this published definition to your times describes the shape of your race; it does not say why it happened. Source: <a href="https://doi.org/10.1371/journal.pone.0251513" rel="noopener noreferrer">doi:10.1371/journal.pone.0251513</a>.
      </p>
    </EvidencePanel>
  );
}

/* ------------------------------------------------------------------ */
/* Opening (arithmetic, mapped to the six published opening groups)    */
/* ------------------------------------------------------------------ */

function bandOf(pct: number, bands: OpeningBand[]): OpeningBand | null {
  const tol = 1e-8;
  return bands.find((b) => (b.lower === null || (b.lower_inclusive ? pct >= b.lower - tol : pct > b.lower + tol))
    && (b.upper === null || (b.upper_inclusive ? pct <= b.upper + tol : pct < b.upper - tol))) ?? null;
}
function shortBand(b: OpeningBand): string {
  if (b.lower === null && b.upper !== null) return `< −${Math.abs(b.upper)}%`;
  if (b.upper === null && b.lower !== null) return `> +${b.lower}%`;
  if (b.lower !== null && b.upper !== null && b.lower === -b.upper) return `±${b.upper}%`;
  const f = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v)}`;
  return `${f(b.lower!)} to ${f(b.upper!)}%`;
}

function OpeningPanel({ reading, units, bands, cities, place, course, gender }: {
  reading: SplitReading; units: UnitSystem; bands: OpeningBand[]; cities: string[]; place: string; course: string; gender: Gender;
}) {
  const pct = reading.opening * 100;
  const band = bandOf(pct, bands);
  const five = units === 'mi' ? '3.1 mi' : '5 km';
  const params = new URLSearchParams();
  if (band) params.set('opening', band.id);
  if (course !== 'all' && cities.includes(place)) params.set('race', place);
  if (gender !== 'all') params.set('gender', gender === 'men' ? 'Men' : 'Women');
  const href = `/analyses/starting-pace${params.toString() ? `?${params.toString()}` : ''}`;
  return (
    <EvidencePanel kind="arithmetic" id="split-check-opening"
      title={<>Opening: {Math.abs(reading.opening) < 0.0005 ? 'level with' : `${pctAbs(reading.opening)} ${reading.opening < 0 ? 'quicker' : 'slower'} than`} your {baseName(units)} pace</>}
      meta={`First ${five} ${fmtPace(reading.paces[0], units)} against ${fmtPace(reading.baseline, units)}. The first section is not part of the reference block, so the two are compared directly.`}>
      {bands.length ? (
        <>
          <ol className="split-check-bands" aria-label="The six opening groups, quickest first">
            {bands.map((b) => (
              <li key={b.id} className={band?.id === b.id ? 'is-you' : undefined} aria-current={band?.id === b.id ? 'true' : undefined}>
                <span>{shortBand(b)}</span>
                {band?.id === b.id ? <b>you</b> : null}
              </li>
            ))}
          </ol>
          <div className="split-check-bands-axis" aria-hidden="true"><span>← quicker start</span><span>slower start →</span></div>
          <p className="tool-note">
            {band ? <>Your opening is in the <strong>{band.label.toLowerCase()}</strong> group of the starting-pace analysis. </> : null}
            <Link href={href}>See how finishes that opened like this played out</Link>, including where their slowdowns began.
          </p>
        </>
      ) : (
        <p className="tool-note"><Link href="/analyses/starting-pace">See how finishes with different openings played out</Link> in the starting-pace analysis.</p>
      )}
    </EvidencePanel>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison with finishes in your window (Pace Notes data)           */
/* ------------------------------------------------------------------ */

function ComparisonPanel({ comparison, times, units, where, course, genderWord, fallbacks }: {
  comparison: Comparison; times: number[]; units: UnitSystem; where: string; course: string; genderWord: string; fallbacks: ReactNode;
}) {
  const ok = comparison.state === 'ok' ? comparison : null;
  const title = ok ? <>Finishes like yours: {formatDuration(ok.lo, true)} to {formatDuration(ok.hi, true)} {where}</> : <>Finishes at your time {where}</>;
  return (
    <EvidencePanel kind="data" id="split-check-compare" title={title}
      meta={ok ? <>Complete finishes{genderWord ? ` recorded as ${genderWord}` : ''} in the 5-minute window that holds your {formatDuration(times[8], true)}, grouped by whether they had a sustained slowdown. Observed, not a grade or a plan.</> : undefined}>
      {comparison.state === 'loading' ? <p className="tool-state" aria-live="polite">Loading the finishes at your time…</p> : null}
      {comparison.state === 'off' ? <p className="tool-state is-error" role="alert">{comparison.message}</p> : null}
      {comparison.state === 'unavailable' ? (
        <div className="split-check-unavailable" role="status">
          <p><strong>{comparison.title}</strong> {comparison.message}</p>
          {fallbacks}
        </div>
      ) : null}
      {ok ? <ComparisonBody ok={ok} times={times} units={units} where={where} course={course} fallbacks={fallbacks} /> : null}
    </EvidencePanel>
  );
}

function ComparisonBody({ ok, times, units, where, course, fallbacks }: {
  ok: Extract<Comparison, { state: 'ok' }>; times: number[]; units: UnitSystem; where: string; course: string; fallbacks: ReactNode;
}) {
  const { all, held, slow } = ok;
  const sd = all.sd ?? (slow ? slow.n / all.n : null);
  const at20 = (c: Cell | null) => (c ? times[3] - c.e50[3] : null);
  const h20 = at20(held);
  const s20 = at20(slow);
  const closer = h20 !== null && s20 !== null ? (Math.abs(s20) < Math.abs(h20) ? 'slow' : 'held') : null;
  const missing = [!held ? 'held-pace' : null, !slow ? 'sustained-slowdown' : null].filter(Boolean);
  return (
    <>
      <div className="split-check-facts">
        <div><b>{count(all.n)}</b><span>complete finishes · {editions(all.ed)}</span></div>
        {sd !== null && sd !== undefined ? <div><b>{share(sd)}</b><span>had a sustained slowdown (observed share)</span></div> : null}
      </div>
      {h20 !== null || s20 !== null ? (
        <p className="split-check-takeaway">
          At the 20 km mat you were {h20 !== null ? <Rel seconds={h20} what="the held-pace median" /> : null}{h20 !== null && s20 !== null ? ' and ' : null}{s20 !== null ? <Rel seconds={s20} what="the sustained-slowdown median" /> : null}.
          {closer ? <> Through 20 km your times were closer to the median of finishes that {closer === 'slow' ? 'later had a sustained slowdown' : 'held pace'}.</> : null}
        </p>
      ) : null}
      {held || slow ? <GapChart times={times} held={held} slow={slow} units={units} /> : null}
      <div className="tool-table-wrap">
        <table className="tool-table split-check-compare">
          <thead>
            <tr>
              <th scope="col">Mat</th>
              <th scope="col" className="split-check-you-cell">You</th>
              <th scope="col"><i className="split-check-dot" style={{ background: HELD }} aria-hidden="true" />Held pace<span className="split-check-th-sub">median · you vs it</span></th>
              <th scope="col"><i className="split-check-dot" style={{ background: SLOW }} aria-hidden="true" />Sustained slowdown<span className="split-check-th-sub">median · you vs it</span></th>
            </tr>
          </thead>
          <tbody>
            {CHECKPOINTS.map((km, i) => (
              <tr key={km} className={i === 8 ? 'is-finish' : i === 3 ? 'is-key' : undefined}>
                <th scope="row">
                  <span className="split-check-sec">{km >= 42.19 ? 'Finish' : `${km} km`}</span>
                  <span className="split-check-sub">{units === 'mi' ? (km >= 42.19 ? '26.2 mi' : matName(km, 'mi')) : ''}</span>
                  <span className="split-check-you-inline">you {formatDuration(times[i])}</span>
                </th>
                <td className="split-check-you-cell">{formatDuration(times[i])}</td>
                <td>{held ? <>{formatDuration(held.e50[i])}<span className={`split-check-delta${times[i] - held.e50[i] < 0 ? ' is-ahead' : ''}`}>{ahead(times[i] - held.e50[i])}</span></> : '—'}</td>
                <td>{slow ? <>{formatDuration(slow.e50[i])}<span className={`split-check-delta${times[i] - slow.e50[i] < 0 ? ' is-ahead' : ''}`}>{ahead(times[i] - slow.e50[i])}</span></> : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row">Finishes</th><td className="split-check-you-cell" /><td>{held ? count(held.n) : '—'}</td><td>{slow ? count(slow.n) : '—'}</td></tr>
            <tr><th scope="row">Editions</th><td className="split-check-you-cell" /><td>{held ? count(held.ed) : '—'}</td><td>{slow ? count(slow.ed) : '—'}</td></tr>
          </tfoot>
          <caption>
            Median elapsed time of each group at the official mats, and how far ahead or behind it you were (ahead = you passed that mat earlier). The groups are selected by how their races ended, so the differences describe those races; they do not show what caused them.
            {missing.length ? ` Fewer than 100 finishes in the ${missing.join(' and ')} group, so it is not shown.` : ''}
          </caption>
        </table>
      </div>
      {missing.length ? <div className="no-print">{fallbacks}</div> : null}
      <p className="tool-note">
        {course === 'all'
          ? <>All courses pools {editions(all.ed)} from the races in Pace Notes. If your race is not one of them, this group comes from other races and courses. </>
          : <>Editions {where} are pooled, so the group mixes years, fields and weather. </>}
        Only complete finishes are recorded: runners who stopped are not in the data. Counts are finishes, not people.
      </p>
    </>
  );
}

function Rel({ seconds, what }: { seconds: number; what: string }) {
  const r = relation(seconds);
  return <>{r.time ? <b>{r.time}</b> : null}{r.time ? ' ' : ''}{r.words} {what}</>;
}

/** Your elapsed time minus each group's median at every mat: above zero means ahead of that median. Hand-built SVG. */
function GapChart({ times, held, slow, units }: { times: number[]; held: Cell | null; slow: Cell | null; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const H = narrow ? 220 : 250;
  const m = { l: 50, r: narrow ? 70 : 96, t: 24, b: 28 };
  const series = [
    held ? { key: 'held', name: 'vs held pace', colour: HELD, ink: '#2346E6', d: [0, ...times.map((t, i) => t - held.e50[i])] } : null,
    slow ? { key: 'slow', name: 'vs slowdown', colour: SLOW, ink: '#B4380D', d: [0, ...times.map((t, i) => t - slow.e50[i])] } : null,
  ].filter((s): s is { key: string; name: string; colour: string; ink: string; d: number[] } => s !== null);
  const kms = [0, ...CHECKPOINTS];
  const values = series.flatMap((s) => s.d);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const span = Math.max(maxV - minV, 60);
  const tick = [15, 30, 60, 120, 180, 300, 600, 900, 1800].find((s) => span / s <= 4) ?? 1800;
  const lo = Math.floor((minV - span * 0.08) / tick) * tick;
  const hi = Math.ceil((maxV + span * 0.08) / tick) * tick;
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih; // ahead (negative) at the top
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(v);
  const path = (d: number[]) => d.map((v, i) => `${i ? 'L' : 'M'}${x(kms[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  // End labels, kept at least 26 px apart.
  const ends = series.map((s) => ({ s, ly: y(s.d[9]) })).sort((a, b) => a.ly - b.ly);
  for (let k = 1; k < ends.length; k += 1) if (ends[k].ly - ends[k - 1].ly < 26) ends[k].ly = ends[k - 1].ly + 26;
  const tickText = (v: number) => (v === 0 ? '0' : formatDuration(Math.abs(v)));
  const xTicks = units === 'mi' ? [0, 5, 10, 15, 20, 25].map((mi) => ({ km: mi * KM_PER_MILE, label: String(mi) })) : (narrow ? [0, 10, 20, 30, 40] : [0, 5, 10, 15, 20, 25, 30, 35, 40]).map((km) => ({ km, label: String(km) }));
  const aria = `Your elapsed time against each group's median at every mat. ${series.map((s) => `${s.name === 'vs held pace' ? 'Held-pace median' : 'Sustained-slowdown median'}: ${CHECKPOINTS.map((km, i) => `${km >= 42.19 ? 'finish' : `${km} km`} ${ahead(s.d[i + 1])}`).join(', ')}.`).join(' ')}`;
  return (
    <div ref={ref} className="viz split-check-gap">
      <svg width={width} height={H} role="img" aria-label={aria}>
        {ticks.map((v) => (
          <g key={v} className="grid">
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            <text x={m.l - 7} y={y(v) + 4} textAnchor="end">{tickText(v)}</text>
          </g>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={y(0)} y2={y(0)} stroke="var(--ink-2)" strokeWidth={1.2} />
        <text x={2} y={m.t - 9} className="axis-label">↑ you ahead of the median · behind ↓</text>
        {xTicks.map((t) => <text key={t.label} x={x(t.km)} y={H - 8} textAnchor="middle">{t.label}</text>)}
        {series.map((s) => (
          <g key={s.key}>
            <path d={path(s.d)} fill="none" stroke={s.colour} strokeWidth={2.4} strokeLinejoin="round" />
            {s.d.slice(1).map((v, i) => <circle key={i} cx={x(CHECKPOINTS[i])} cy={y(v)} r={3.2} fill={s.colour} stroke="var(--card)" strokeWidth={1.5} />)}
          </g>
        ))}
        {ends.map(({ s, ly }) => (
          <g key={s.key}>
            <text x={m.l + iw + 8} y={ly - 1} className="split-check-end" style={{ fill: s.ink }}>{s.name}</text>
            <text x={m.l + iw + 8} y={ly + 11} className="split-check-end-sub">{ahead(s.d[9])}</text>
          </g>
        ))}
      </svg>
      <p className="split-check-axis-note">{units === 'mi' ? 'Miles' : 'Kilometres'} from the start. At zero you matched that group’s median elapsed time; every finish compared here finished in your window.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pacing type (Pace Notes data: clusters of complete finishes)        */
/* ------------------------------------------------------------------ */

function TypePanel({ reading, type, error, units }: { reading: SplitReading; type: TypeResult; error: boolean; units: UnitSystem }) {
  if (!type) {
    return (
      <EvidencePanel kind="data" title="Pacing type" id="split-check-type">
        {error ? <p className="tool-state is-error" role="alert">The pacing-type classifier could not be loaded or verified. Everything else on this page still applies.</p>
          : <p className="tool-state" aria-live="polite">Loading the pacing types…</p>}
      </EvidencePanel>
    );
  }
  const { arch, colour, all } = type;
  return (
    <EvidencePanel kind="data" id="split-check-type" title={<>Pacing type: {type.name}</>}
      meta={`The nearest of six shapes found in complete Pace Notes finishes, comparing each section with your own average pace. ${share(arch.share)} of complete finishes are ${type.name.toLowerCase()}s.`}>
      <p className="split-check-blurb" style={{ borderColor: colour }}>{arch.blurb}</p>
      <ProfileChart reading={reading} arch={arch} colour={colour} units={units} />
      <ul className="split-check-types" aria-label="The six pacing types and their observed shares of complete finishes">
        {all.map((a, i) => (
          <li key={a.name} className={a.name === type.name ? 'is-you' : undefined} aria-current={a.name === type.name ? 'true' : undefined}>
            <i style={{ background: ARCHETYPE_COLOURS[i % ARCHETYPE_COLOURS.length] }} aria-hidden="true" />
            <span>{a.name}</span><small>{share(a.share)}</small>
          </li>
        ))}
      </ul>
      <p className="tool-note">A descriptive label for the shape of your race, not a grade or a cause. <Link href="/stories/pacing-types">Meet all six types</Link>.</p>
    </EvidencePanel>
  );
}

function ProfileChart({ reading, arch, colour, units }: { reading: SplitReading; arch: Archetype; colour: string; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 480;
  const H = narrow ? 200 : 220;
  const m = { l: 40, r: narrow ? 64 : 84, t: 22, b: 26 };
  const mids = SECTION_BOUNDS.map(([a, b]) => (a + b) / 2);
  const you = reading.relative;
  const values = [...you, ...arch.profile_p25, ...arch.profile_p75, 0];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = maxV - minV;
  const tick = [2, 5, 10, 20, 25, 50].find((s) => span / s <= 5) ?? 50;
  const lo = Math.floor(minV / tick) * tick;
  const hi = Math.ceil(maxV / tick) * tick;
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(v);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(mids[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const band = `${line(arch.profile_p25)} ${[...arch.profile_p75].reverse().map((v, j) => `L${x(mids[8 - j]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} Z`;
  const ink = TYPE_INK[ARCHETYPE_COLOURS.indexOf(colour as (typeof ARCHETYPE_COLOURS)[number])] ?? 'var(--ink-2)';
  const ends = [{ key: 'you', text: 'You', colour: 'var(--ink)', ly: y(you[8]) }, { key: 'type', text: 'Typical', colour: ink, ly: y(arch.profile[8]) }].sort((a, b) => a.ly - b.ly);
  if (ends[1].ly - ends[0].ly < 14) ends[1].ly = ends[0].ly + 14;
  const xTicks = units === 'mi' ? [0, 5, 10, 15, 20, 25].map((mi) => ({ km: mi * KM_PER_MILE, label: String(mi) })) : (narrow ? [0, 10, 20, 30, 40] : [0, 5, 10, 15, 20, 25, 30, 35, 40]).map((km) => ({ km, label: String(km) }));
  return (
    <div ref={ref} className="viz split-check-profile">
      <svg width={width} height={H} role="img"
        aria-label={`Each section's pace against your own average pace, beside the typical ${arch.name}. You: ${you.map((v, i) => `${secName(i, units)} ${signedPct(v, 1)}`).join(', ')}. Typical ${arch.name}: ${arch.profile.map((v, i) => `${secName(i, units)} ${signedPct(v, 1)}`).join(', ')}.`}>
        {ticks.map((v) => (
          <g key={v} className="grid">
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            <text x={m.l - 7} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0'}%</text>
          </g>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />
        <text x={2} y={m.t - 9} className="axis-label">vs your average pace · quicker ↑</text>
        {xTicks.map((t) => <text key={t.label} x={x(t.km)} y={H - 7} textAnchor="middle">{t.label}</text>)}
        <path d={band} fill={colour} opacity={0.16} />
        <path d={line(arch.profile)} fill="none" stroke={ink} strokeWidth={2} strokeDasharray="5 4" />
        <path d={line(you)} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinejoin="round" />
        {you.map((v, i) => <circle key={i} cx={x(mids[i])} cy={y(v)} r={3} fill="var(--ink)" stroke="var(--card)" strokeWidth={1.5} />)}
        {ends.map((e) => <text key={e.key} x={m.l + iw + 8} y={e.ly + 4} className="split-check-end" style={{ fill: e.colour }}>{e.text}</text>)}
      </svg>
      <p className="split-check-axis-note">Solid: your sections. Dashed: the median {arch.name}, with the middle half of that type’s finishes shaded.</p>
    </div>
  );
}
