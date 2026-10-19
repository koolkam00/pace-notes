'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import PaceBandStrip from '@/components/tools/PaceBandStrip';
import { DurationField, ExampleNote, GoalBar, ShareBar, Stepper } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import DotGrid from '@/components/viz/DotGrid';
import Values from '@/components/ui/Values';
import { loadInsight } from '@/lib/insights';
import { loadShard, type CourseGoal, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { MARATHON_KM, perUnit, splitTable } from '@/lib/tools/pace';
import { CHECKPOINTS, PACE_BAND_INDEX, cellOf, fmtGoal, fmtPace, paceBandShardPath, type PaceBandCell } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, PLAN_GOAL_MAX_S, PLAN_GOAL_MIN_S, courseGoalResult, goalShare, publishedGoal, readPlanGoal, roundedNote } from '@/lib/tools/plan';
import { formatDuration, formatHM } from '@/lib/tools/time';
import { KM_PER_MILE, matLabel, type UnitSystem } from '@/lib/units';
import { count } from '@/lib/viz/format';

/** A course the planner offers, with the tools and pages that publish it (read from their index files at build time). */
export interface PlanCourse {
  slug: string;
  city: string;
  /** Why no edition of this course passed the data screens, when none did; it then has no course-goal rows. */
  screened: string | null;
  /** The pace band, the race-day projector and the weather match publish this course. */
  band: boolean; projector: boolean; weather: boolean;
  /** /courses/<slug> exists. */
  page: boolean;
}

const DEFAULTS = { course: 'all', goal: '4:00' };
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

/** "5K" with the mile equivalent in miles; the finish "Finish" with the marathon distance. Mats keep their names in both units. */
function MatName({ km, units }: { km: number; units: UnitSystem }) {
  const finish = km >= 42.19;
  return <>{finish ? 'Finish' : matLabel(km)}{units === 'mi' ? <small>{finish ? '26.2 mi' : `${(km / KM_PER_MILE).toFixed(1)} mi`}</small> : null}</>;
}

interface Observed { held: PaceBandCell | null; slow: PaceBandCell | null; lo: number; hi: number; minute: number }

/** Even pace (the visitor's plan) beside the observed medians at each mat, in separately labelled columns. */
function MatTable({ goal, pKm, units, observed }: { goal: number; pKm: number; units: UnitSystem; observed: Observed | null }) {
  const held = observed?.held ?? null;
  const slow = observed?.slow ?? null;
  const data = held || slow;
  return (
    <table className="tool-table plan-mat-table">
      <caption className="sr-only">{data ? 'Even-pace elapsed time for your goal at each official mat, beside the median elapsed time of the held-pace and sustained-slowdown groups (Pace Notes data)' : 'Even-pace elapsed time for your goal at each official mat'}</caption>
      <thead>
        <tr>
          <th scope="col">Mat</th>
          <th scope="col">Your plan</th>
          {/* Short heads, so four columns fit a phone; the caption names the two groups in full. */}
          {held ? <th scope="col">Held</th> : null}
          {slow ? <th scope="col">Slowed</th> : null}
        </tr>
      </thead>
      <tbody>
        {CHECKPOINTS.map((km, i) => (
          <tr key={km} className={i === 8 ? 'is-finish' : undefined}>
            <th scope="row"><MatName km={km} units={units} /></th>
            <td>{formatDuration(i === 8 ? goal : pKm * km)}</td>
            {held ? <td>{formatDuration(held.e50[i])}</td> : null}
            {slow ? <td>{formatDuration(slow.e50[i])}</td> : null}
          </tr>
        ))}
      </tbody>
      {data ? (
        <tfoot>
          <tr><th scope="row">Finishes</th><td />{held ? <td>{count(held.n)}</td> : null}{slow ? <td>{count(slow.n)}</td> : null}</tr>
        </tfoot>
      ) : null}
    </table>
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

export default function RacePlan({ courseGoalSha, paceBandSha, courses }: { courseGoalSha: string | null; paceBandSha: string | null; courses: PlanCourse[] }) {
  const { units } = useUnits();
  const [q, setQuery, ready, fromUrl] = useQueryState(DEFAULTS);
  // The example: the default 4:00 on all courses, untouched and not from a link.
  const [touched, setTouched] = useState(false);
  const setQ = useCallback((patch: Partial<typeof DEFAULTS>) => { setTouched(true); setQuery(patch); }, [setQuery]);
  const isExample = ready && fromUrl.size === 0 && !touched;

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
  const minute = goal === null ? null : Math.floor(goal / 60);
  const bandGoals = bandIndex.data?.goals ?? BAND_GOALS_FALLBACK;
  const inBand = minute !== null && minute >= bandGoals[0] && minute <= bandGoals[1];
  const windowS = shard.data?.window_s || 300;
  const all = shard.data && minute !== null && inBand ? cellOf(shard.data.groups.all, minute) : null;
  const observed: Observed | null = shard.data && all && minute !== null ? {
    held: cellOf(shard.data.groups.held, minute), slow: cellOf(shard.data.groups.slowdown, minute), lo: minute * 60 - windowS, hi: minute * 60 - 1, minute,
  } : null;
  const comparison = observed && (observed.held || observed.slow) ? observed : null;

  // The nugget: of finishes on the goal's pace through 20K (the course-goal rows at the nearest published goal), the share
  // that made it, on every course pooled or on the chosen one.
  const result = goalData.data && goal !== null && course ? courseGoalResult(goalData.data, course.city, goal, course.screened) : null;
  const published = goalData.data && goal !== null ? publishedGoal(goal, goalData.data.goals, goalData.data.goal_step_min) : null;
  const share = useMemo(() => {
    if (!goalData.data || goal === null) return null;
    if (isAll) return published ? { ...goalShare(goalData.data.rows, published.minutes), minutes: published.minutes, rounded: published.rounded } : null;
    if (result?.state === 'row') return { n: result.row.n, under: result.row.under, courses: 1, minutes: result.minutes, rounded: result.rounded };
    return null;
  }, [goalData.data, goal, isAll, published, result]);
  const shareOk = share && typeof share.n === 'number' && typeof share.under === 'number' ? share as { n: number; under: number; courses: number; minutes: number; rounded: boolean } : null;
  const rows = useMemo(() => (goal === null ? [] : splitTable(goal, MARATHON_KM, units === 'mi' ? 'mi' : 'km')), [goal, units]);

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
  const loading = Boolean(courseGoalSha && !goalData.data && !goalData.error);
  const dataError = goalData.error ?? bandIndex.error ?? shard.error;
  // One "Try again" loads every file that failed (a failed index also stops its shard), so either error box clears both.
  const retry = () => { if (goalData.error) goalData.retry(); if (bandIndex.error) bandIndex.retry(); if (shard.error) shard.retry(); };
  const madeOf100 = shareOk ? Math.round(shareOk.under * 100) : null;
  const shareGoal = shareOk ? formatHM(shareOk.minutes * 60) : null;
  // The group's window, named wherever the group is ("within 2% of 4:00 pace"), as the chapter's reading names it: the
  // checkpoint analysis and the projector say "on 4:00 pace" of groups of their own.
  const nearGoal = shareGoal ? `within ${Math.round((goalData.data?.tolerance ?? 0.02) * 100)}% of ${shareGoal} pace` : null;
  const summary = goal === null || pKm === null ? problem : loading ? null : [
    `${fmtGoal(goal)} goal${course ? ` in ${course.city}` : ''}: even pace ${fmtPace(pKm, units)}.`,
    shareOk ? `Pace Notes data: of 100 finishes ${nearGoal} through 20 km ${where}, ${madeOf100} made ${shareGoal}.` : '',
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
  const city = course?.city ?? null;
  // Why the nugget is missing, when it is: said once, under the plan.
  const missing = !planned ? null
    : unknown ? 'This link names a course that is not in the data. Choose one above; your plan and pace band still work.'
    : !courseGoalSha ? null
    : goalData.error ? null
    : isAll && goalData.data && !published ? `Results on goal pace are published for goals from ${formatHM(goalData.data.goals[0] * 60)} to ${formatHM(goalData.data.goals[1] * 60)}. Your plan and pace band work for any goal from 1:30 to 8:00.`
    : result?.state === 'unavailable' ? `No results for ${course?.city ?? 'this course'} at this goal. ${result.reason} Your plan and pace band still work.`
    : null;

  return (
    <div className="plan-root" data-print={printMode}>
      <div className="tool-workspace">
        {/* The answer first (the analyses' grammar): the plan for the example, then the inputs that make it yours. */}
        <div className="tool-results tool-answer">
          {!planned ? <p className="tool-empty plan-problem">{problem}</p> : (
            <div className="print-only plan-print-head">
              <p className="plan-print-kicker">Pace Notes · race plan</p>
              <p className="plan-print-title">{place} · {fmtGoal(goal)} goal</p>
              <p>Even pace {fmtPace(pKm, units)} · {fmtPace(pKm, units === 'mi' ? 'km' : 'mi')}. Cut the strips out along the dashed lines.</p>
            </div>
          )}
          {/* SectionTracker looks for the marked sections once per page view, so each stays mounted, hidden while it has
              nothing to show, and counts when it first shows. */}
          <div data-track-section="result" hidden={!planned}>
            {planned ? (
              <section className="tool-reading night plan-headline" aria-labelledby="plan-headline-title">
                {/* The new number is the pace, as on the pace band and the goal pages: the goal the visitor typed is the
                    kicker. The mat times are the wristband's, below, so the card does not list them a second time. */}
                <div className="tool-reading-head">
                  <p className="tool-reading-kicker">{isExample ? 'Example · ' : ''}<span id="plan-headline-title">{fmtGoal(goal)}{city ? ` in ${city}` : ''}</span></p>
                  <h2 className="tool-reading-figure">
                    {formatDuration(perUnit(pKm, units))}
                    <small>per {units === 'mi' ? 'mile' : 'km'}, even pace · {formatDuration(perUnit(pKm, units === 'mi' ? 'km' : 'mi'))}/{units === 'mi' ? 'km' : 'mi'}</small>
                  </h2>
                </div>
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
        </form>

        <div className="tool-results">
          <p className="sr-only" aria-live="polite">{status}</p>
          {planned && (missing || goalData.error) ? (
            goalData.error ? <DataProblem error={goalData.error} onRetry={retry} /> : <p className="tool-note plan-unavailable">{missing}</p>
          ) : null}

          <div data-track-section="comparison" hidden={!planned || !shareOk}>
            {planned && shareOk && madeOf100 !== null && shareGoal && nearGoal ? (
              <section className="tool-panel plan-comparison" id="plan-comparison" aria-labelledby="plan-comparison-title">
                <EvidenceTag kind="data" />
                <div className="plan-nugget">
                  <p className="tool-nugget-text" id="plan-comparison-title">
                    Of 100 finishes {nearGoal} through 20K {isAll ? `across ${shareOk.courses} courses` : `in ${city}`}, <em>{madeOf100}</em> made {shareGoal}.
                  </p>
                  <DotGrid lit={madeOf100} label={`Of 100 finishes ${nearGoal} through 20 km ${isAll ? 'across every course' : `in ${city}`}, ${madeOf100} made ${shareGoal}.`} />
                </div>
                {shareOk.rounded ? <p className="tool-note">{roundedNote(shareOk.minutes, goal, goalData.data!.goal_step_min)}</p> : null}
                <Values id="plan-mats-values" caption={comparison ? `Every mat: your plan beside finishes from ${formatDuration(comparison.lo, true)} to ${formatDuration(comparison.hi, true)} ${where}` : 'Every mat: your plan'} count={9}>
                  <MatTable goal={goal} pKm={pKm} units={units} observed={comparison} />
                </Values>
              </section>
            ) : null}
          </div>

          <div data-track-section="pace-band" hidden={!planned}>
            {planned ? (
              <section className="tool-panel plan-band" id="plan-band" aria-labelledby="plan-band-title">
                {/* No badge: the strips are the visitor's own even-pace times (the page's data badge sits on the nugget
                    above, and the printed page names its source). */}
                <header className="tool-panel-head plan-band-head">
                  <h2 className="tool-panel-title" id="plan-band-title">Your pace band</h2>
                </header>
                <PaceBandStrip goal={goal} pKm={pKm} units={units} rows={rows} interval={units === 'mi' ? 'mi' : 'km'} overrun={0} place={place} genderWord=""
                  observed={comparison ? { held: comparison.held, lo: comparison.lo, hi: comparison.hi, place, genderWord: '' } : null} profile={null} showBack={false} waiting={false} />
                {/* One print action, the band this page exists for; the browser's own print command gives the whole plan. */}
                <ShareBar extra={<button type="button" className="btn btn-primary is-compact" data-not-edit onClick={() => printAs('strip')}>Print wristband strips</button>} />
              </section>
            ) : null}
          </div>

          {planned ? (
            <>
              <div className="print-only plan-print-mats"><MatTable goal={goal} pKm={pKm} units={units} observed={comparison} /></div>
              {/* Only a page that prints observed columns (the mat table's groups and the "H" line) is attributed to the data. */}
              <p className="print-only plan-print-source">{comparison ? 'Your plan beside Pace Notes data' : 'Your race plan'} · splithappens.run/tools/plan</p>
              {/* No next-step row: the journey's finish card follows, the page's one way forward (section 00, cut 4). */}
              {dataError && !goalData.error ? <DataProblem error={dataError} onRetry={retry} /> : null}
              <GoalBar label="Goal" onStep={step}>
                <b>{fmtGoal(goal)}</b><span>{fmtPace(pKm, units)}</span>
              </GoalBar>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
