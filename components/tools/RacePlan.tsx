'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import AsRunTable, { AsRunNote, MatName } from '@/components/tools/AsRunTable';
import BandChoice, { KickerText, TerrainLine } from '@/components/tools/BandChoice';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import PaceBandStrip from '@/components/tools/PaceBandStrip';
import StretchTables from '@/components/tools/StretchTables';
import { DataLead, DurationField, GoalBar, ReadingFoot, ShareBar, Stepper } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import Values from '@/components/ui/Values';
import { loadInsight } from '@/lib/insights';
import { loadShard, type CourseGoal, type CourseGoalRow, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { bandChoice, bandKicker, bandMinute, bandRows, bandView, cardMats, climbs, climbsLine, goalPace, matRows, noTerrainLine, tidyChoice, unitSplits } from '@/lib/tools/terrain-band';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import { PACE_BAND_INDEX, cellOf, fmtGoal, fmtPace, paceBandShardPath, type PaceBandCell } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, PLAN_GOAL_MAX_S, PLAN_GOAL_MIN_S, courseGoalResult, goalPaceNote, goalShare, publishedGoal, readPlanGoal, roundedNote } from '@/lib/tools/plan';
import type { NoTerrainWhy, TerrainCourse } from '@/lib/tools/terrain-data';
import { PACES_LABEL, pacesNote, pacesUnit, stretchCount, stretchesName, stretchesTitle, stripPaces, tidyPaces } from '@/lib/tools/stretch-paces';
import { formatDuration, formatHM } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

/** A course the planner offers, with the tools and pages that publish it (read from their index files at build time). */
export interface PlanCourse {
  slug: string;
  city: string;
  /** Why no edition of this course passed the data screens, when none did; it then has no course-goal rows. */
  screened: string | null;
  /** The pace band, the race-day projector and the weather match publish this course. */
  band: boolean; projector: boolean; weather: boolean;
  /** The course's terrain splits (tools/course-terrain.json, read at build time), or null where it has none. */
  terrain: TerrainCourse | null;
  /** Why a course has no terrain splits; null on a terrain course, or for every course when the file is not in the build. */
  why: NoTerrainWhy | null;
  /** /courses/<slug> exists. */
  page: boolean;
}

/**
 * The address: the course, the goal, the band's mode (`pace=even` only; terrain, the default where a course has it, stays
 * out) and each stretch's pace on the strips (`paces=1` only; off, the default, stays out).
 */
const DEFAULTS = { course: 'all', goal: '4:00', pace: '', paces: '' };
/** The pace band's observed goals, before its index loads (whole minutes). */
const BAND_GOALS_FALLBACK: [number, number] = [150, 390];

const clampGoal = (s: number) => Math.min(PLAN_GOAL_MAX_S, Math.max(PLAN_GOAL_MIN_S, s));
/** The loader's own neutral message ("could not be loaded" / "could not be verified"); a browser network error reads as the first. */
const errorText = (e: unknown) => (e instanceof Error && e.message.startsWith('This data') ? e.message : 'This data could not be loaded. Check the connection and try again.');

/** One verified insights file. `retry` loads it again (loadInsight drops a failed request from its cache). */
function useInsight<T>(path: string, sha: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!sha) return;
    let live = true;
    loadInsight<T>(path, sha).then((data) => { if (live) setState({ data, error: null }); }, (e: unknown) => { if (live) setState({ data: null, error: errorText(e) }); });
    return () => { live = false; };
  }, [path, sha, attempt]);
  const retry = useCallback(() => { setState({ data: null, error: null }); setAttempt((a) => a + 1); }, []);
  return { ...state, retry };
}

/** One verified pace-band shard listed in the index, or nothing when the index does not list it. */
function useShard(index: PaceBandIndex | null, path: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; data: PaceBandShard | null; error: string | null } | null>(null);
  const listed = Boolean(path && index?.shards?.[path]);
  useEffect(() => {
    if (!index || !path || !listed) return;
    let live = true;
    loadShard<PaceBandShard>(index, path).then((data) => { if (live) setState({ path, data, error: null }); }, (e: unknown) => { if (live) setState({ path, data: null, error: errorText(e) }); });
    return () => { live = false; };
  }, [index, path, listed, attempt]);
  const retry = useCallback(() => { setState(null); setAttempt((a) => a + 1); }, []);
  const current = state && state.path === path ? state : null;
  return { listed, data: current?.data ?? null, error: current?.error ?? null, loading: listed && !current, retry };
}

/** The pace band's groups for the course (or all courses), all recorded genders, in the goal's window: the As run panel's medians. */
interface Observed { all: PaceBandCell; held: PaceBandCell | null; slow: PaceBandCell | null; lo: number; hi: number; minute: number }

/**
 * Every official mat's time on the band: on terrain, each mat's terrain-split time beside its even-pace time (matRows);
 * at even pace, the visitor's own times alone. The observed medians are never in this table: they are in the As run
 * panel (AsRunTable). Exported for scripts/verify-tools.cjs, which renders both.
 */
export function MatTable({ goal, units, terrain }: { goal: number; units: UnitSystem; terrain: TerrainCourse | null }) {
  const mats = matRows(goal, terrain);
  if (terrain) {
    return (
      <table className="tool-table plan-mat-table">
        <caption className="sr-only">Terrain-split elapsed time for your goal at each official mat (published research), beside the even-pace time</caption>
        <thead><tr><th scope="col">Mat</th><th scope="col">Terrain</th><th scope="col">Even pace</th></tr></thead>
        <tbody>
          {mats.map((m, i) => (
            <tr key={m.km} className={i === 8 ? 'is-finish' : undefined}>
              <th scope="row"><MatName km={m.km} units={units} /></th>
              <td>{formatDuration(m.terrain!)}</td>
              <td>{formatDuration(m.even)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table className="tool-table plan-mat-table">
      <caption className="sr-only">Even-pace elapsed time for your goal at each official mat</caption>
      <thead><tr><th scope="col">Mat</th><th scope="col">Your plan</th></tr></thead>
      <tbody>
        {mats.map((m, i) => (
          <tr key={m.km} className={i === 8 ? 'is-finish' : undefined}>
            <th scope="row"><MatName km={m.km} units={units} /></th>
            <td>{formatDuration(m.even)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Where the reading sits among the courses (round 6: the spread course by course is the course chooser's reading, so the
 * planner shows only where its own share falls): each course with 100 finishes on the goal's pace through 20K as a quiet
 * dot at its share, the lowest and highest named under the line; the reading in signal, the chosen course's dot, or with
 * every course pooled, the "All courses" tick. The other tick stays quiet. A label's leader stops short of its label.
 * Static HTML, no script: the course box is the control.
 */
function CourseSpread({ rows, chosen, pooled, label }: { rows: CourseGoalRow[]; chosen: string | null; pooled: number | null; label: string }) {
  const lo = rows[0], hi = rows[rows.length - 1];
  const top = Math.max(0.1, Math.ceil((hi.under + 0.02) * 10) / 10);
  const at = (v: number) => `${((Math.min(v, top) / top) * 100).toFixed(2)}%`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const mine = chosen ? rows.find((r) => r.city === chosen) ?? null : null;
  // A label near an edge is held inside the line: anchored to its left or right end instead of its middle.
  const side = (v: number) => (v / top < 0.18 ? 'is-start' : v / top > 0.82 ? 'is-end' : '');
  const near = (a: number, b: number) => Math.abs(a - b) / top < 0.16;
  // Dots that would touch stack upward (at the narrowest phone line, 288 px), the chosen course on the line itself.
  const W = 288, D = 10;
  const order = [...rows].sort((a, b) => Number(b === mine) - Number(a === mine));
  const placed: { px: number; level: number }[] = [];
  const level = new Map<CourseGoalRow, number>();
  for (const r of order) {
    const px = (Math.min(r.under, top) / top) * W;
    let lv = 0;
    while (placed.some((p) => p.level === lv && Math.abs(p.px - px) < D)) lv++;
    placed.push({ px, level: lv });
    level.set(r, lv);
  }
  const stack = Math.max(0, ...placed.map((p) => p.level));
  const pooledShown = pooled !== null && !(mine && near(mine.under, pooled));
  return (
    <div className="plan-spread" role="img" aria-label={label} data-leader-scope="" style={{ ['--stack' as string]: stack } as CSSProperties}>
      <div className="plan-spread-line" aria-hidden="true">
        {pooledShown ? <span className={`plan-spread-all ${side(pooled!)}${mine ? '' : ' is-reading'}`.trim()} style={{ left: at(pooled!) }}>All courses</span> : null}
        {pooled !== null ? <i className={`plan-spread-tick${mine ? '' : ' is-reading'}`} data-leader="" style={{ left: at(pooled) }} /> : null}
        {rows.map((r) => <i key={r.city} className={`plan-spread-dot${mine === r ? ' is-chosen' : ''}`} style={{ left: at(r.under), ['--level' as string]: level.get(r) ?? 0 } as CSSProperties} />)}
        {mine ? <span className={`plan-spread-name ${side(mine.under)}`.trim()} style={{ left: at(mine.under) }}>{mine.city}</span> : null}
      </div>
      <div className="plan-spread-ends" aria-hidden="true">
        {mine !== lo ? <span className={side(lo.under) || undefined} style={{ left: at(lo.under) }}>{lo.city} {pct(lo.under)}</span> : null}
        {mine !== hi ? <span className={side(hi.under) || undefined} style={{ left: at(hi.under) }}>{hi.city} {pct(hi.under)}</span> : null}
      </div>
    </div>
  );
}

/** A data file that could not be loaded or verified, with a way to load it again. */
function DataProblem({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="tool-state is-error plan-error">
      <p>{error}</p>
      <button type="button" className="btn btn-secondary is-compact" onClick={onRetry}>Try again</button>
    </div>
  );
}

/**
 * The example's reading, read at build from the same verified course-goal file (the page's server component), so the first
 * paint opens on the lead the chapter card promises instead of a placeholder that the loaded data would push down.
 */
export interface PlanExample { minutes: number; tolerance: number; n: number; under: number; courses: number; rows: CourseGoalRow[] }

export default function RacePlan({ courseGoalSha, paceBandSha, courses, example = null, how }: {
  courseGoalSha: string | null; paceBandSha: string | null; courses: PlanCourse[]; example?: PlanExample | null;
  /** The page's methods anchor, the last line of the mats' "All numbers" (ToolEnd `numbers`). */
  how?: string;
}) {
  const { units } = useUnits();
  const [q, setQuery, ready, fromUrl] = useQueryState(DEFAULTS);
  // The example: the default 4:00 on all courses, untouched and not from a link. The stretch-pace option shows the same plan
  // another way, so neither ticking it nor a link holding only paces=1 ends the example.
  const [touched, setTouched] = useState(false);
  const setQ = useCallback((patch: Partial<typeof DEFAULTS>) => { setTouched(true); setQuery(patch); }, [setQuery]);
  const isExample = ready && Array.from(fromUrl).every((key) => key === 'paces') && !touched;

  const { seconds: goal, read, problem } = readPlanGoal(q.goal);
  // A goal in any form the tools read (210, 3:30:00, 3h30) is kept in the address as H:MM, or H:MM:SS with seconds.
  useEffect(() => {
    if (ready && read !== null && fmtGoal(read) !== q.goal) setQuery({ goal: fmtGoal(read) });
  }, [ready, read, q.goal, setQuery]);
  const setGoal = (s: number | null) => setQ({ goal: s === null ? '' : fmtGoal(s) });
  // ±1 minute, snapping in the direction of travel when the goal has seconds (3:30:30 → 3:31 or 3:30). A goal outside
  // 1:30–8:00 goes to the nearer end first.
  const step = (delta: number) => {
    if (goal === null && read !== null) { setGoal(clampGoal(read)); return; }
    const m = (goal ?? 4 * 3600) / 60;
    setGoal(clampGoal((delta > 0 ? Math.floor(m) + delta / 60 : Math.ceil(m) + delta / 60) * 60));
  };

  const isAll = q.course === 'all' || q.course === '';
  const course = isAll ? null : courses.find((c) => c.slug === q.course) ?? null;
  // Never echo an unknown slug from the address into the copy.
  const unknown = !isAll && !course;
  const place = isAll ? 'All courses' : course?.city ?? 'this course';
  const where = isAll ? 'on all courses' : course ? `in ${course.city}` : 'on this course';

  const goalData = useInsight<CourseGoal>(COURSE_GOAL_FILE, courseGoalSha);
  const bandIndex = useInsight<PaceBandIndex>(PACE_BAND_INDEX, paceBandSha);
  const shardScope = isAll ? 'all' : course?.band ? course.slug : null;
  const shard = useShard(bandIndex.data, shardScope ? paceBandShardPath(shardScope, 'all') : null);

  const pKm = goal === null ? null : goal / MARATHON_KM;
  // The pace band's windows use whole minutes: a goal with seconds uses the minute at or below it, so every finish beat it.
  const minute = goal === null ? null : bandMinute(goal);
  const bandGoals = bandIndex.data?.goals ?? BAND_GOALS_FALLBACK;
  const inBand = minute !== null && minute >= bandGoals[0] && minute <= bandGoals[1];
  const windowS = shard.data?.window_s || 300;
  const all = shard.data && minute !== null && inBand ? cellOf(shard.data.groups.all, minute) : null;
  const observed: Observed | null = shard.data && all && minute !== null ? {
    all, held: cellOf(shard.data.groups.held, minute), slow: cellOf(shard.data.groups.slowdown, minute), lo: minute * 60 - windowS, hi: minute * 60 - 1, minute,
  } : null;

  // The band (owner decision, October 23, 2026): on a course with terrain splits (tools/course-terrain.json, read at
  // build time, lib/tools/terrain-band.ts), the visitor's goal spread over the corrected route at an even effort, unless
  // the visitor chose even pace; on all courses, and on a course without them, even pace, with the one line saying why.
  // Nothing waits on a file: the terrain is in the page.
  const { mode, banded, offered } = bandView({ terrain: isAll ? null : course?.terrain ?? null, choice: q.pace });
  const bandState = offered ? 'choice' as const : !isAll && course ? 'none' as const : 'off' as const;
  // Why there are no terrain splits (no checked route profile, or one that did not pass its check); nothing when the
  // terrain file is not in the build.
  const noTerrain = bandState === 'none' && course?.why ? noTerrainLine(course.city, course.why) : '';
  // A hand-edited `pace` (pace=foo, pace=EVEN) is the default and leaves the address, as does `even` on all courses, where
  // no choice is offered; a choice of even pace on a course stays and carries to the next course, but not through All
  // courses (tidyChoice).
  useEffect(() => {
    if (ready && q.pace !== tidyChoice(q.pace, isAll)) setQuery({ pace: tidyChoice(q.pace, isAll) });
  }, [ready, q.pace, isAll, setQuery]);
  // Each stretch's pace on the strips (owner request, October 29, 2026): `paces=1` stays, any other value leaves the
  // address (tidyPaces); off is never written.
  useEffect(() => {
    if (ready && q.paces !== tidyPaces(q.paces)) setQuery({ paces: tidyPaces(q.paces) });
  }, [ready, q.paces, setQuery]);
  const pacesOn = q.paces === '1';

  // The lead: of finishes on the goal's pace through 20K (the course-goal rows at the nearest published goal), the share
  // that made it, on every course pooled or on the chosen one. Until the file loads, the 4:00 example on every course reads
  // the build's copy of the same rows.
  const exampleOn = !goalData.data && example !== null && isAll && goal === example.minutes * 60;
  const result = goalData.data && goal !== null && course ? courseGoalResult(goalData.data, course.city, goal, course.screened) : null;
  const published = goalData.data && goal !== null ? publishedGoal(goal, goalData.data.goals, goalData.data.goal_step_min)
    : exampleOn ? { minutes: example!.minutes, rounded: false } : null;
  const share = useMemo(() => {
    if (exampleOn) return { n: example!.n, under: example!.under, courses: example!.courses, minutes: example!.minutes, rounded: false };
    if (!goalData.data || goal === null) return null;
    if (isAll) return published ? { ...goalShare(goalData.data.rows, published.minutes), minutes: published.minutes, rounded: published.rounded } : null;
    if (result?.state === 'row') return { n: result.row.n, under: result.row.under, courses: 1, minutes: result.minutes, rounded: result.rounded };
    return null;
  }, [exampleOn, example, goalData.data, goal, isAll, published, result]);
  const shareOk = share && typeof share.n === 'number' && typeof share.under === 'number' ? share as { n: number; under: number; courses: number; minutes: number; rounded: boolean } : null;
  // Every course's share at the published goal, lowest first: the courses the course-goal file lists, each with 100 such
  // finishes (the course chooser's set), drawn as where the reading sits; and the share across every course pooled.
  const spread = useMemo(() => {
    if (exampleOn) return example!.rows.length >= 2 ? example!.rows : null;
    if (!goalData.data || !published) return null;
    const listed = new Set(goalData.data.courses.map((c) => c.city));
    const at = goalData.data.rows.filter((r) => r.goal === published.minutes && listed.has(r.city) && r.n >= 100).sort((a, b) => a.under - b.under || a.city.localeCompare(b.city));
    return at.length >= 2 ? at : null;
  }, [exampleOn, example, goalData.data, published]);
  const pooled = exampleOn ? { under: example!.under } : goalData.data && published ? goalShare(goalData.data.rows, published.minutes) : null;
  const rows = useMemo(() => (goal === null ? [] : bandRows(goal, units === 'mi' ? 'mi' : 'km', banded)), [goal, units, banded]);
  // The terrain splits' nine mat times for the mat strip, and the climbs line under the card's.
  const mats = goal !== null && banded ? matRows(goal, banded).map((m) => m.terrain!) : null;
  const climbText = goal !== null && banded ? climbsLine(goal, banded, units) : '';
  // With the option on, each 5K's and each mile's (or km's) pace under its time on the strips, from the band's own times.
  const paces = useMemo(() => (goal !== null && pacesOn ? stripPaces(goal, banded, units) : null), [goal, pacesOn, banded, units]);
  // The finishes near the goal as they ran (unscaled), for the As run panel.
  const asRunCaption = observed ? `Median elapsed time at each mat, finishes from ${formatDuration(observed.lo, true)} to ${formatDuration(observed.hi, true)} ${where}` : '';

  // Printing: the wristband strips alone, or the one-page plan (also what the browser's own print command gives).
  const [printMode, setPrintMode] = useState<'plan' | 'strip'>('plan');
  useEffect(() => {
    const reset = () => setPrintMode('plan');
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);
  const printAs = (mode: 'plan' | 'strip') => {
    setPrintMode(mode);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  // One always-mounted, visually hidden status line, debounced while typing. The first settled result is not announced.
  const loading = Boolean(courseGoalSha && !goalData.data && !goalData.error && !exampleOn);
  const dataError = goalData.error ?? bandIndex.error ?? shard.error;
  // One "Try again" loads every file that failed (a failed index also stops its shard), so either error box clears both.
  const retry = () => { if (goalData.error) goalData.retry(); if (bandIndex.error) bandIndex.retry(); if (shard.error) shard.retry(); };
  const madeOf100 = shareOk ? Math.round(shareOk.under * 100) : null;
  const shareGoal = shareOk ? formatHM(shareOk.minutes * 60) : null;
  // The group's window, named wherever the group is ("within 2% of 4:00 pace"), as the chapter's reading names it: the
  // checkpoint analysis and the projector say "on 4:00 pace" of groups of their own.
  const tolerance = goalData.data?.tolerance ?? example?.tolerance ?? 0.02;
  // The same words in either mode, as the chapter's card says them: the Splits choice is about the band, not this group.
  const nearGoal = shareGoal ? `within ${Math.round(tolerance * 100)}% of ${shareGoal} pace` : null;
  // The lead's line, as the chapter card's key words it ("of finishes within 2% of 4:00 pace through 20K made 4:00").
  const leadLine = nearGoal && shareGoal ? `of finishes ${nearGoal} through 20K${isAll ? '' : ` in ${course?.city ?? ''}`} made ${shareGoal}` : null;
  const spreadText = spread && leadLine && madeOf100 !== null
    ? `${madeOf100}% ${leadLine}; course by course, from ${Math.round(spread[0].under * 100)}% in ${spread[0].city} to ${Math.round(spread[spread.length - 1].under * 100)}% in ${spread[spread.length - 1].city}.`
    : null;
  // On terrain the summary names the slowest climb, or that every unit is within 2% of the average when that is so.
  const terrainSummary = () => {
    if (goal === null || pKm === null || !banded) return '';
    const word = units === 'mi' ? 'mile' : 'km';
    const slow = climbs(goal, banded, units);
    const slowest = slow.length ? slow.reduce((a, b) => (b.split > a.split ? b : a)) : null;
    const avg = goal / (MARATHON_KM / (units === 'mi' ? KM_PER_MILE : 1));
    const steady = !slowest && unitSplits(goal, banded, units).every((u) => Math.abs(u.split / avg - 1) <= 0.02);
    const clause = slowest ? `, slowest ${word} ${slowest.n} at ${formatDuration(slowest.split)}` : steady ? `, every ${word} within 2% of it` : '';
    return `${fmtGoal(goal)} goal in ${banded.city}: terrain splits, average ${fmtPace(pKm, units)}${clause}.`;
  };
  const summary = goal === null || pKm === null ? problem : loading ? null : [
    banded ? terrainSummary()
      : `${fmtGoal(goal)} goal${course ? ` in ${course.city}` : ''}: even pace ${fmtPace(pKm, units)}.`,
    shareOk ? `Pace Notes data: ${spreadText ?? `${madeOf100}% ${leadLine}.`}` : '',
    result?.state === 'unavailable' ? 'No course results for this goal.' : '',
    dataError ?? '',
  ].filter(Boolean).join(' ');
  const [status, setStatus] = useState('');
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (summary === null) return;
    const t = window.setTimeout(() => {
      if (announced.current === null) { announced.current = summary; return; }
      if (summary !== announced.current) { announced.current = summary; setStatus(summary); }
    }, 500);
    return () => window.clearTimeout(t);
  }, [summary]);

  const fieldError = read !== null && goal === null ? problem : undefined;
  const planned = goal !== null && pKm !== null && minute !== null;
  const unitWord = units === 'mi' ? 'mile' : 'km';
  const city = course?.city ?? null;
  // Why the nugget is missing, when it is: said once, under the plan. Where the course has terrain splits (in either
  // mode, so the Splits choice never rewrites it) the note is scoped to the results on goal pace (goalPaceNote), so their
  // own minimum of editions never reads as a rule the terrain splits beside it break.
  const missing = !planned ? null
    : unknown ? 'This link names a course that is not in the data. Choose one above; your plan and pace band still work.'
    : !courseGoalSha ? null
    : goalData.error ? null
    : isAll && goalData.data && !published ? `Results on goal pace are published for goals from ${formatHM(goalData.data.goals[0] * 60)} to ${formatHM(goalData.data.goals[1] * 60)}. Your plan and pace band work for any goal from 1:30 to 8:00.`
    : result?.state === 'unavailable' && goalData.data && offered ? goalPaceNote(result, course?.city ?? 'this course')
    : result?.state === 'unavailable' ? `No results for ${course?.city ?? 'this course'} at this goal. ${result.reason} Your plan and pace band still work.`
    : null;
  return (
    <div className="plan-root" data-print={printMode}>
      <div className="tool-workspace">
        {/* The lead first (round 6): the share the chapter card into this page promises, on paper with its badge, and where
            it sits among the courses. Then the plan itself on the night card, the inputs that make it yours, and the band.
            SectionTracker looks for the marked sections once per page view, so each stays mounted, hidden while it has
            nothing to show, and counts when it first shows. */}
        <div className="tool-results tool-lead-slot plan-lead-slot">
          <p className="sr-only" aria-live="polite">{status}</p>
          {planned && (missing || goalData.error) ? (
            goalData.error ? <DataProblem error={goalData.error} onRetry={retry} /> : <p className="tool-note plan-unavailable">{missing}</p>
          ) : null}
          {planned && loading ? <p className="tool-state plan-loading" aria-hidden="true">Reading the finishes on your goal’s pace…</p> : null}
          <div data-track-section="comparison" hidden={!planned || !shareOk}>
            {planned && shareOk && madeOf100 !== null && leadLine ? (
              <DataLead id="plan-comparison" titleId="plan-comparison-title" className="plan-comparison"
                figure={{ value: String(madeOf100), unit: '%', sr: `${madeOf100} percent` }} line={<>{leadLine}.</>}>
                {spread ? <CourseSpread rows={spread} chosen={isAll ? null : city} pooled={pooled?.under ?? null} label={spreadText ?? ''} /> : null}
                {shareOk.rounded && goalData.data ? <p className="tool-note">{roundedNote(shareOk.minutes, goal, goalData.data.goal_step_min)}</p> : null}
              </DataLead>
            ) : null}
          </div>
        </div>

        <div className="tool-results tool-answer">
          {!planned ? <p className="tool-empty plan-problem">{problem}</p> : (
            <div className="print-only plan-print-head">
              <p className="plan-print-kicker">Pace Notes · race plan</p>
              <p className="plan-print-title">{place} · {fmtGoal(goal)} goal</p>
              <p>{banded ? <>Terrain splits (Published research): {fmtGoal(goal)} over the {banded.city} route at an even effort, average {fmtPace(pKm, units)}.</>
                : <>Even pace {fmtPace(pKm, units)} · {fmtPace(pKm, units === 'mi' ? 'km' : 'mi')}.</>} Cut the strips out along the dashed lines.</p>
            </div>
          )}
          <div data-track-section="result" hidden={!planned}>
            {planned ? (
              <section className={`tool-reading night plan-headline${banded ? ' is-terrain' : ''}`} aria-labelledby="plan-headline-title">
                {/* The plan's pace, as on the goal pages: the goal the visitor typed is the kicker. Four mat times under it on a
                    phone and in the card's right half from 900 px (round 6: the dek promises the splits), hidden from
                    assistive tech, which reads every mat on the strips. On terrain the figure is the goal's average pace,
                    the lines under it say what the terrain splits are (not a prediction) and where they climb, the four
                    times are the terrain splits' own, and the card carries the Published research badge. */}
                <div className="tool-reading-head">
                  <p className="tool-reading-kicker">{isExample ? 'Example · ' : ''}<span id="plan-headline-title">{fmtGoal(goal)}{city ? ` in ${city}` : ''}</span></p>
                  <h2 className="tool-reading-figure">
                    {formatDuration(perUnit(pKm, units))}
                    <small>per {unitWord}, {banded ? 'average' : 'even pace'} · {formatDuration(perUnit(pKm, units === 'mi' ? 'km' : 'mi'))}/{units === 'mi' ? 'km' : 'mi'}</small>
                  </h2>
                  {banded ? <TerrainLine goal={goal} city={banded.city} climbs={climbText} className="plan-shape-line" /> : null}
                </div>
                <dl className="plan-card-mats" aria-hidden="true">
                  {cardMats(goal, banded).map(([k, t]) => (
                    <div key={k}><dt>{k}</dt><dd>{formatDuration(t)}</dd></div>
                  ))}
                </dl>
                {/* The terrain splits are published research: their badge sits on the card at every width. The data lead
                    above keeps its own badge, in its own section. */}
                {banded ? <ReadingFoot badge={<EvidenceTag kind="research" />} copy={false} /> : null}
              </section>
            ) : null}
          </div>
        </div>

        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Race planner inputs">
          <h2>Your race</h2>
          <div className="tool-field">
            <label htmlFor="plan-course">Course</label>
            <select id="plan-course" value={unknown ? q.course : isAll ? 'all' : q.course} onChange={(e) => setQ({ course: e.target.value })}>
              <option value="all">All courses</option>
              {unknown ? <option value={q.course} disabled>Unknown course</option> : null}
              {courses.map((c) => <option key={c.slug} value={c.slug}>{c.city}</option>)}
            </select>
          </div>
          <div className="plan-goal tool-goal">
            <Stepper label="Goal" onStep={step}>
              <DurationField label="Goal finish time" large value={read} onChange={setGoal} placeholder="4:00" format={fmtGoal}
                hint="h:mm or h:mm:ss, from 1:30 to 8:00." error={fieldError} />
            </Stepper>
          </div>
          {planned ? <BandChoice id="plan-band-choice" state={bandState} mode={mode} onChange={(m) => setQ({ pace: bandChoice(m) })} line={noTerrain} /> : null}
        </form>

        <div className="tool-results">
          <div data-track-section="pace-band" hidden={!planned}>
            {planned ? (
              <section className="tool-panel plan-band" id="plan-band" aria-labelledby="plan-band-title">
                {/* The terrain splits carry the Published research badge and the band's kicker, without the average the
                    card above already gives (a page says each number once); even pace none, the visitor's own times (the
                    printed page names its source either way). */}
                <header className="tool-panel-head plan-band-head">
                  {banded ? <EvidenceTag kind="research" /> : null}
                  <h2 className="tool-panel-title" id="plan-band-title">Your pace band</h2>
                  {banded ? <p className="tool-reading-kicker plan-band-kicker"><KickerText text={bandKicker({ goal, place, terrain: banded, units, pace: false })} /></p> : null}
                </header>
                <PaceBandStrip goal={goal} pKm={pKm} units={units} rows={rows} interval={units === 'mi' ? 'mi' : 'km'} overrun={0} place={place} genderWord=""
                  profile={null} showBack={false} waiting={false} mats={mats} terrain={Boolean(banded)} paces={paces} />
                {/* The option sits directly under the band it changes: each stretch's pace under its time, in the page's units, and
                    while it is on one line under it says what each pace is (the strips' captions print only on paper). It
                    shows the same plan another way, so it is not a change to the plan (setQuery: the example stays). */}
                <label className="tool-check band-paces no-print"><input type="checkbox" checked={pacesOn} aria-describedby={pacesOn ? 'plan-paces-note' : undefined} onChange={(e) => setQuery({ paces: e.target.checked ? '1' : '' })} /><span>{PACES_LABEL}<small>{pacesUnit(units)}</small></span></label>
                {pacesOn ? <p className="tool-note band-paces-note no-print" id="plan-paces-note">{pacesNote(units, true)}</p> : null}
                {/* One print action, the band this page exists for; the browser's own print command gives the whole plan. */}
                <ShareBar extra={<button type="button" className="btn btn-primary is-compact" data-not-edit onClick={() => printAs('strip')}>Print wristband strips</button>} />
                {/* Every mat, one fold: the terrain splits beside even pace, or the plan alone. */}
                <Values id="plan-mat-values" how={how} count={9} caption={banded ? 'Every mat: terrain splits beside even pace' : 'Every mat: your plan'}>
                  <MatTable goal={goal} units={units} terrain={banded} />
                </Values>
                {/* Every stretch's time and pace, from the same band (no badge inside the fold: the panel carries it). */}
                <Values id="plan-stretch-values" count={stretchCount(units)} name={stretchesName(units)} caption={stretchesTitle(units)}>
                  <StretchTables goal={goal} terrain={banded} units={units} />
                </Values>
              </section>
            ) : null}
          </div>

          {/* How the finishes near the goal ran (Pace Notes data), at the times they ran, never scaled to the goal and never
              a band: a record of those races, slowdowns included, in its own panel after the band, with the forewarning. */}
          {planned && observed ? (
            <section className="tool-panel plan-asrun" id="plan-asrun" aria-labelledby="plan-asrun-title">
              <EvidenceTag kind="data" />
              <h2 className="tool-panel-title" id="plan-asrun-title">As run near {fmtGoal(goal)} {where}</h2>
              <p className="tool-note plan-asrun-note"><AsRunNote sd={observed.all.sd} /></p>
              <Values id="plan-asrun-values" how={how} caption={asRunCaption} count={9}>
                <AsRunTable cells={{ all: observed.all, held: observed.held, slow: observed.slow }} units={units} short />
              </Values>
            </section>
          ) : null}

          {planned ? (
            <>
              <div className="print-only plan-print-mats">
                <MatTable goal={goal} units={units} terrain={banded} />
                {observed ? (
                  <div className="plan-print-asrun">
                    <p className="plan-print-asrun-title">As run near {fmtGoal(goal)} {where} · Pace Notes data</p>
                    <p className="plan-print-asrun-note"><AsRunNote sd={observed.all.sd} /></p>
                    <AsRunTable cells={{ all: observed.all, held: observed.held, slow: observed.slow }} units={units} short />
                  </div>
                ) : null}
              </div>
              {/* Each source the printed page holds is named: the terrain splits (published research) and the as-run table (Pace Notes data). */}
              <p className="print-only plan-print-source">{banded ? 'Terrain splits from published research' : observed ? 'Your plan' : 'Your race plan'}{observed ? ' · As run from Pace Notes data' : ''} · splithappens.run/tools/plan</p>
              {/* With the option on, the printed plan adds every stretch's time and pace, on a page of its own. */}
              {pacesOn ? (
                <div className="print-only plan-print-stretches">
                  <p className="plan-print-stretches-title">{stretchesTitle(units)} · {fmtGoal(goal)} · {place}{banded ? ' · terrain splits from published research' : ''}</p>
                  <StretchTables goal={goal} terrain={banded} units={units} />
                </div>
              ) : null}
              {/* No next-step row: the journey's finish card follows, the page's one way forward (section 00, cut 4). */}
              {dataError && !goalData.error ? <DataProblem error={dataError} onRetry={retry} /> : null}
              <GoalBar label="Goal" onStep={step}>
                <b>{fmtGoal(goal)}</b><span>{goalPace(pKm, units, Boolean(banded))}</span>
              </GoalBar>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
