'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { ToolHandoffs } from '@/components/tools/Handoffs';
import PaceBandStrip from '@/components/tools/PaceBandStrip';
import { DurationField, EvidencePanel, ExampleNote, ShareBar, Stat, Stepper } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { loadInsight } from '@/lib/insights';
import { loadShard, type CourseContext, type CourseGoal, type CourseGoalRow, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { MARATHON_KM, perUnit, splitTable } from '@/lib/tools/pace';
import { CHECKPOINTS, PACE_BAND_INDEX, cellOf, fmtGoal, fmtPace, paceBandShardPath, type PaceBandCell } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, PLAN_GOAL_MAX_S, PLAN_GOAL_MIN_S, courseGoalResult, publishedGoal, readPlanGoal, roundedNote } from '@/lib/tools/plan';
import { EVIDENCE_LABEL, toolBySlug, type ToolEvidence } from '@/lib/tools/registry';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { formatDuration, formatHM, formatMargin } from '@/lib/tools/time';
import { KM_PER_MILE, elevationValue, type UnitSystem } from '@/lib/units';
import { count } from '@/lib/viz/format';

/** A course the planner offers, with the tools and pages that publish it (read from their index files at build time). */
export interface PlanCourse {
  slug: string;
  city: string;
  /** Why no edition of this course passed the data screens, when none did; it then has no course-goal rows. */
  screened: string | null;
  /** The pace band, the race-day projector and the weather match publish this course. */
  band: boolean; projector: boolean; weather: boolean;
  /** /courses/<slug> exists, and the analyses take this city as race=. */
  page: boolean; analyses: boolean;
  /** The official qualifying page for this course's race, for the six races with standards. */
  qualifying: { key: string; title: string; checked: string } | null;
}

const DEFAULTS = { course: 'all', goal: '4:00' };
/** The pace band's observed goals, before its index loads (whole minutes). */
const BAND_GOALS_FALLBACK: [number, number] = [150, 390];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pctText = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
const editions = (k: number) => (k === 1 ? 'one edition' : `${count(k)} editions`);
const miles = (km: number) => `${(km / KM_PER_MILE).toFixed(1)} mi`;
const clampGoal = (s: number) => Math.min(PLAN_GOAL_MAX_S, Math.max(PLAN_GOAL_MIN_S, s));
/** The loader's own neutral message ("could not be loaded" / "could not be verified"); a browser network error reads as the first. */
const errorText = (e: unknown) => (e instanceof Error && e.message.startsWith('This data') ? e.message : 'This data could not be loaded. Check the connection and try again.');
/** An analysis for this course (race=, when the analyses take it) and a goal in whole minutes, as readAnalysisProfile reads them. */
const analysisHref = (slug: string, city: string | null, minutes: number) => `/analyses/${slug}?${city ? `race=${encodeURIComponent(city)}&` : ''}goal=${minutes}`;

/** "45–62°F" or "7–16°C" across a course's editions; a single value when the range rounds to one number. */
function tempRange(range: [number, number], units: UnitSystem): string {
  const t = (c: number) => Math.round(units === 'mi' ? c * 1.8 + 32 : c);
  const [a, b] = [t(range[0]), t(range[1])];
  const sign = (v: number) => String(v).replace('-', '−');
  const unit = units === 'mi' ? '°F' : '°C';
  return a === b ? `${sign(a)}${unit}` : `${sign(a)}${a < 0 || b < 0 ? ' to ' : '–'}${sign(b)}${unit}`;
}
/** Whole feet or metres. Source values stay metric. */
const elevation = (metres: number, units: UnitSystem) => `${count(Math.round(elevationValue(metres, units)))} ${units === 'mi' ? 'ft' : 'm'}`;

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

/** "5 km" with the mile equivalent in miles; the source checkpoints stay metric. */
function MatName({ km, units }: { km: number; units: UnitSystem }) {
  const finish = km >= 42.19;
  return <>{finish ? 'Finish' : `${km} km`}<small>{finish ? (units === 'mi' ? '26.2 mi' : '42.2 km') : units === 'mi' ? miles(km) : null}</small></>;
}

interface Observed { held: PaceBandCell | null; slow: PaceBandCell | null; lo: number; hi: number; minute: number }

/** Even pace (the visitor's plan) beside the observed medians at each mat, in separately labelled columns. */
function MatTable({ goal, pKm, units, observed }: { goal: number; pKm: number; units: UnitSystem; observed: Observed | null }) {
  const held = observed?.held ?? null;
  const slow = observed?.slow ?? null;
  const data = held || slow;
  return (
    <div className="tool-table-wrap">
      <table className="tool-table plan-mat-table">
        <caption className="sr-only">{data ? 'Even-pace elapsed time for your goal at each official mat, calculated, beside the median elapsed time of the held-pace and sustained-slowdown groups (Pace Notes data)' : 'Even-pace elapsed time for your goal at each official mat, calculated'}</caption>
        <thead>
          <tr className="plan-mat-groups">
            <th scope="col" rowSpan={2}>Mat</th>
            <th scope="col">Your plan</th>
            {data ? <th scope="colgroup" colSpan={held && slow ? 2 : 1}>Pace Notes data</th> : null}
          </tr>
          <tr>
            <th scope="col">Even pace</th>
            {held ? <th scope="col"><i className="plan-key is-held" aria-hidden="true" />Held pace</th> : null}
            {slow ? <th scope="col"><i className="plan-key is-slow" aria-hidden="true" />Sustained slowdown</th> : null}
          </tr>
        </thead>
        <tbody>
          {CHECKPOINTS.map((km, i) => (
            <tr key={km} className={i === 8 ? 'is-finish' : i === 3 ? 'is-key' : undefined}>
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
            <tr><th scope="row">Editions</th><td />{held ? <td>{count(held.ed)}</td> : null}{slow ? <td>{count(slow.ed)}</td> : null}</tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** A data file that could not be loaded or verified, with a way to load it again. */
function DataProblem({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="tool-state is-error plan-error">
      <p>{error}</p>
      <button type="button" className="button-secondary" onClick={onRetry}>Try again</button>
    </div>
  );
}

/** The badge of the page a card opens, from its registry entry: the qualifying page's official standards, kept apart from the data. */
function TargetBadge({ slug }: { slug: string }) {
  const kind: ToolEvidence | undefined = toolBySlug(slug)?.evidence[0];
  return kind ? <span className={`evidence-badge evidence-${kind}`}>{EVIDENCE_LABEL[kind]}</span> : null;
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
  const result = goalData.data && goal !== null && course ? courseGoalResult(goalData.data, course.city, goal, course.screened) : null;
  // The same published goal on every course, for the closed list under the comparison.
  const sameGoal = goalData.data && goal !== null ? publishedGoal(goal, goalData.data.goals, goalData.data.goal_step_min)?.minutes ?? null : null;
  const sameGoalRows = useMemo(() => (goalData.data && sameGoal !== null ? goalData.data.rows.filter((r) => r.goal === sameGoal).sort((a, b) => a.city.localeCompare(b.city)) : []),
    [goalData.data, sameGoal]);
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
  const loading = Boolean(course && courseGoalSha && !goalData.data && !goalData.error) || (isAll && (shard.loading || Boolean(paceBandSha && !bandIndex.data && !bandIndex.error)));
  const dataError = goalData.error ?? bandIndex.error ?? shard.error;
  // One "Try again" loads every file that failed (a failed index also stops its shard), so either error box clears both.
  const retry = () => { if (goalData.error) goalData.retry(); if (bandIndex.error) bandIndex.retry(); if (shard.error) shard.retry(); };
  const summary = goal === null || pKm === null ? problem : loading ? null : [
    `${fmtGoal(goal)} goal${course ? ` in ${course.city}` : ''}: even pace ${fmtPace(pKm, units)}, calculated from your goal.`,
    result?.state === 'row' ? `Pace Notes data: of ${count(result.row.n)} finishes that ran 5–20 km at ${formatHM(result.minutes * 60)} pace, ${pctText(result.row.under)} finished under ${formatHM(result.minutes * 60)} and ${pctText(result.row.sd)} had a sustained slowdown.` : '',
    result?.state === 'unavailable' ? `No course results for this goal. ${result.reason}` : '',
    isAll && all?.sd !== undefined && minute !== null ? `Pace Notes data: ${pctText(all.sd)} of ${count(all.n)} finishes in the five minutes up to ${formatHM(minute * 60)} had a sustained slowdown.` : '',
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

  return (
    <div className="plan-root" data-print={printMode}>
      <div className="tool-workspace">
        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Race planner inputs">
          <h2>Your race</h2>
          {isExample ? <ExampleNote>A 4:00 goal on all courses. Choose your course and type your goal; everything below updates.</ExampleNote> : null}
          <div className="tool-field">
            <label htmlFor="plan-course">Course</label>
            <select id="plan-course" value={unknown ? q.course : isAll ? 'all' : q.course} onChange={(e) => setQ({ course: e.target.value })}>
              <option value="all">All courses</option>
              {unknown ? <option value={q.course} disabled>Unknown course</option> : null}
              {courses.map((c) => <option key={c.slug} value={c.slug}>{c.city}</option>)}
            </select>
          </div>
          <div className="plan-goal">
            <Stepper label="Goal" onStep={step}>
              <DurationField label="Goal finish time" large value={read} onChange={setGoal} placeholder="4:00"
                hint="h:mm or h:mm:ss, from 1:30 to 8:00." error={fieldError} />
            </Stepper>
          </div>
          <p className="tool-field-hint">Everything is worked out in your browser. The course you choose only picks which public data file loads.</p>
        </form>

        <div className="tool-results">
          <p className="sr-only" aria-live="polite">{status}</p>
          {!planned ? <p className="tool-empty plan-problem">{problem}</p> : (
            <>
              <div className="print-only plan-print-head">
                <p className="plan-print-kicker">Pace Notes · race plan</p>
                <p className="plan-print-title">{place} · {fmtGoal(goal)} goal</p>
                <p>Even pace {fmtPace(pKm, units)} · {fmtPace(pKm, units === 'mi' ? 'km' : 'mi')}, calculated from the goal. Cut the strips out along the dashed lines.</p>
              </div>

              <section className="tool-headline plan-headline" aria-labelledby="plan-headline-title">
                <div className="plan-headline-head">
                  <p className="plan-kicker">Your plan · even pace, calculated from your goal</p>
                  <h2 className="plan-headline-title" id="plan-headline-title">{fmtGoal(goal)}{city ? <span> in {city}</span> : null}</h2>
                </div>
                <div className="plan-headline-stats">
                  {(units === 'mi' ? ['mi', 'km'] as const : ['km', 'mi'] as const).map((u) => (
                    <Stat key={u} label={u === 'mi' ? 'Per mile' : 'Per km'} value={formatDuration(perUnit(pKm, u))} sub={u === 'mi' ? 'even pace, min:sec per mile' : 'even pace, min:sec per km'} />
                  ))}
                </div>
                <ol className="plan-mats" aria-label={`Even-pace elapsed time at each 5 km mat for ${fmtGoal(goal)}`}>
                  {CHECKPOINTS.map((km, i) => (
                    <li key={km} className={i === 8 ? 'is-finish' : undefined}>
                      <span className="plan-mats-k"><MatName km={km} units={units} /></span>
                      <b>{formatDuration(i === 8 ? goal : pKm * km)}</b>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}

          {/* SectionTracker looks for the marked sections once per page view, so each stays mounted, hidden while it has
              nothing to show (no goal, no observed group for this course), and counts when it first shows. */}
          <div data-track-section="result" hidden={!planned}>
            {planned ? (
              <EvidencePanel kind="data" id="plan-result" title={isAll ? <>On all courses, at {fmtGoal(goal)} pace</> : course ? <>On {course.city}, at {fmtGoal(goal)} pace</> : <>Course not found</>}
                meta={isAll && inBand && all ? <>All courses together: the pace band’s group of finishes that came in from {formatDuration(minute * 60 - windowS, true)} to {formatDuration(minute * 60 - 1, true)}, every course and edition pooled. Choose a course for its own results.</>
                  : course && result?.state === 'row' ? <>Observed shares of complete finishes that ran 5–20 km within {Math.round((goalData.data?.tolerance ?? 0.02) * 100)}% of {result.rounded ? <>the {formatHM(result.minutes * 60)} pace, the published goal nearest yours</> : 'your goal pace'}. Not a prediction.</> : undefined}>
                {unknown ? (
                  <p className="plan-unavailable">This link names a course that is not in the data. Choose one above; your plan and pace band below still work.</p>
                ) : isAll ? (
                  !paceBandSha ? <p className="plan-unavailable">The observed finishes are not available in this build. Your plan and pace band still work.</p>
                    : bandIndex.error || shard.error ? <DataProblem error={(bandIndex.error ?? shard.error)!} onRetry={retry} />
                    : !inBand ? <p className="plan-unavailable"><strong>Outside the observed range.</strong> Observed groups cover whole-minute goals from {formatHM(bandGoals[0] * 60)} to {formatHM(bandGoals[1] * 60)}. Your plan and pace band below work for any goal from 1:30 to 8:00.</p>
                    : !shard.data ? <p className="tool-state">Loading the observed finishes…</p>
                    : all ? <AllCourses all={all} goal={goal} minute={minute} units={units} />
                    : <p className="plan-unavailable"><strong>Not published for this goal.</strong> Fewer than 100 finishes came in during the five minutes up to {formatHM(minute * 60)}, so no group is shown.</p>
                ) : course ? (
                  !courseGoalSha ? <p className="plan-unavailable">The course results are not available in this build. Your plan and pace band still work.</p>
                    : goalData.error ? <DataProblem error={goalData.error} onRetry={retry} />
                    : !result ? <p className="tool-state">Loading the course results…</p>
                    : result.state === 'row' ? <CourseRow result={result} goal={goal} units={units} step={goalData.data!.goal_step_min} />
                    : (
                      <div className="plan-unavailable">
                        <p><strong>No course results for {course.city} at this goal.</strong> {result.reason}</p>
                        <p>Your plan above and your pace band below still work.</p>
                        {result.course ? <CourseContextList course={result.course} units={units} /> : null}
                      </div>
                    )
                ) : null}
              </EvidencePanel>
            ) : null}
          </div>

          <div data-track-section="comparison" hidden={!planned || !comparison}>
            {planned && comparison ? (
              <EvidencePanel kind="data" id="plan-comparison" title={<>Where finishes near {fmtGoal(goal)} were at each mat</>}
                meta={<>Finishes that came in from {formatDuration(comparison.lo, true)} to {formatDuration(comparison.hi, true)} {where}, all recorded genders: the median elapsed time at each official mat, by whether they had a sustained slowdown. Observed, not a recommended plan.{goal % 60 ? ` Your goal has seconds, so the window uses the whole minute below it, ${formatHM(comparison.minute * 60)}.` : ''}</>}>
                <MatTable goal={goal} pKm={pKm} units={units} observed={comparison} />
                <p className="plan-caption">
                  20 km is the 20 km mat, not halfway. Your even-pace times are calculated from your goal; the other columns are what finishes ran, and no number mixes the two. Counts are finishes, not people.
                  {!comparison.held ? ' The held-pace group has fewer than 100 finishes in this window, so it is not shown.' : !comparison.slow ? ' The sustained-slowdown group has fewer than 100 finishes in this window, so it is not shown.' : ''}
                </p>
              </EvidencePanel>
            ) : null}
          </div>

          {planned ? (
            <>
              {!comparison && !isAll && course?.band && (bandIndex.error || shard.error) ? (
                <EvidencePanel kind="data" id="plan-comparison-error" title={<>Where finishes near {fmtGoal(goal)} were at each mat</>}>
                  <DataProblem error={(bandIndex.error ?? shard.error)!} onRetry={retry} />
                </EvidencePanel>
              ) : null}
              {!comparison ? <div className="print-only plan-print-mats"><MatTable goal={goal} pKm={pKm} units={units} observed={null} /></div> : null}

              {goalData.error && isAll ? (
                <DataProblem error={goalData.error} onRetry={retry} />
              ) : sameGoal !== null && sameGoalRows.length ? (
                <SameGoal rows={sameGoalRows} minutes={sameGoal} chosen={city} units={units} tolerance={goalData.data!.tolerance} />
              ) : null}
            </>
          ) : null}

          <div data-track-section="pace-band" hidden={!planned}>
            {planned ? (
              <section className="tool-panel plan-band" id="plan-band" aria-labelledby="plan-band-title">
                <header className="tool-panel-head">
                  {/* The strips are the visitor's own even-pace times; the small "H" line is observed, so the panel carries the
                      data badge whenever that line is drawn, as the pace band's own print panel does. */}
                  {comparison?.held ? <span className="evidence-badge evidence-data">Pace Notes data</span> : null}
                  <h2 className="tool-panel-title" id="plan-band-title">Your pace band</h2>
                  <p className="tool-panel-meta">Your plan, ready to cut out: the big numbers are the exact even-pace times at each 5 km mat and every {units === 'mi' ? 'mile' : 'kilometre'}, calculated from your goal.{comparison?.held ? ' The small “H” line is Pace Notes data: the median elapsed time at each mat of the finishes in the comparison above that held their pace.' : ''} Print at 100% scale.</p>
                </header>
                <PaceBandStrip goal={goal} pKm={pKm} units={units} rows={rows} interval={units === 'mi' ? 'mi' : 'km'} overrun={0} place={place} genderWord=""
                  observed={comparison ? { held: comparison.held, lo: comparison.lo, hi: comparison.hi, place, genderWord: '' } : null} profile={null} showBack={false} waiting={false} />
                <ShareBar print={false} extra={<>
                  <button type="button" className="button-primary" data-not-edit onClick={() => printAs('strip')}>Print wristband strips</button>
                  <button type="button" className="button-secondary" data-not-edit onClick={() => printAs('plan')}>Print this plan</button>
                </>} />
                <p className="tool-note no-print">
                  <Link href={`/tools/pace-band?goal=${fmtGoal(goal)}${course?.band ? `&course=${course.slug}` : ''}`}>Open the full pace band</Link> for a watch that reads long, recorded-gender groups and a route elevation strip for the back.
                </p>
              </section>
            ) : null}
          </div>

          {planned ? (
            <>
              {/* Only a page that prints observed columns (the comparison's table and "H" line) is attributed to the data. */}
              <p className="print-only plan-print-source">{comparison ? 'Your plan beside Pace Notes data' : 'Your plan, calculated from your goal'} · splithappens.run/tools/plan</p>

              <section className="plan-next no-print" aria-labelledby="plan-before-title">
                <h2 className="plan-next-title" id="plan-before-title">Before race day</h2>
                <ToolHandoffs label="Tools" links={[
                  { href: `/tools/weather-match?goal=${formatDuration(goal, true)}${course?.weather ? `&course=${course.slug}` : ''}`, accent: toolBySlug('weather-match')?.accent ?? 'var(--gold)', title: 'Weather match',
                    text: <>Past race mornings at your forecast temperature, and how finishes at your pace held up{course?.weather ? `; ${course.city}’s own race mornings too` : ''}.</> },
                  { href: `/tools/projector?target=${formatDuration(goal, true)}&t=none${course?.projector ? `&course=${course.slug}` : ''}`, accent: toolBySlug('projector')?.accent ?? 'var(--rose)', title: 'Race-day projector',
                    text: <>On race day, type a tracker time to see the finish range from what similar finishes ran{course?.projector ? ` in ${course.city}` : ''}.</> },
                  ...(course?.page ? [{ href: `/courses/${course.slug}`, accent: 'var(--teal)', title: `${course.city} course page`, text: <>How finishes paced this course, its route profile and its past editions.</> }] : []),
                ]} />
                {course?.qualifying ? (
                  <ToolHandoffs label="Official standards" links={[{ href: `/tools/qualifying/${course.qualifying.key}`, accent: toolBySlug('qualifying')?.accent ?? 'var(--ink)', title: course.qualifying.title,
                    text: <><TargetBadge slug="qualifying" /> Each age group’s standard and the qualifying window, from the race’s own pages, checked {course.qualifying.checked}.</> }]} />
                ) : null}
                <ToolHandoffs label="Analyses" links={[
                  { href: analysisHref('pacing-pattern', course?.analyses ? course.city : null, minute), accent: 'var(--blue)', title: `How finishes near ${formatHM(minute * 60)} were paced`,
                    text: <>Pace through each section for finishes near your time{course?.analyses ? ` in ${course.city}` : ''}.</> },
                  { href: analysisHref('hills-and-pacing', course?.analyses ? course.city : null, minute), accent: 'var(--green)', title: 'Hills and pacing',
                    text: <>The supplied elevation profile{course?.analyses ? ` of ${course.city}` : ''} beside the section paces of finishes near your time.</> },
                ]} />
              </section>
              <section className="plan-next no-print" aria-labelledby="plan-after-title">
                <h2 className="plan-next-title" id="plan-after-title">After the race</h2>
                <ToolHandoffs label="Read your race" links={[
                  { href: `/tools/split-check${course?.band ? `?course=${course.slug}` : ''}`, accent: toolBySlug('split-check')?.accent ?? 'var(--green)', title: 'Split check',
                    text: <>Paste your nine splits for a report you can print, save or share.</> },
                ]} />
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The course-goal row: who is in it, the shares and times, and the course's context. */
function CourseRow({ result, goal, units, step }: { result: Extract<ReturnType<typeof courseGoalResult>, { state: 'row' }>; goal: number; units: UnitSystem; step: number }) {
  const { row, course, minutes, rounded } = result;
  const goalText = formatHM(minutes * 60);
  const at20 = units === 'mi' ? '12.4 mi' : '20 km';
  return (
    <>
      {rounded ? <p className="plan-rounded">{roundedNote(minutes, goal, step)}</p> : null}
      <div className="plan-stats">
        <Stat label="Finishes" value={count(row.n)} sub={`${editions(row.ed)}, ran 5–20 km at ${goalText} pace`} />
        <Stat label={`Finished under ${goalText}`} value={pctText(row.under)} sub="observed share, editions pooled" />
        <Stat label="Sustained slowdown" value={pctText(row.sd)} sub="observed share, editions counted equally" />
        <Stat label={`After ${at20}`} value={formatMargin(row.after20)} sub="median time beyond the 5–20 km pace, editions counted equally" />
        <Stat label="Median finish" value={formatDuration(row.fin[1], true)} sub={`10th–90th percentile ${formatDuration(row.fin[0], true)}–${formatDuration(row.fin[2], true)}`} />
      </div>
      <p className="tool-note">
        {SLOWDOWN_DEFINITION} Source: <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">{SLOWDOWN_CITATION.label}</a>. These describe finishes that happened to run this pace, chosen after the fact; runners who stopped are not in the data.
      </p>
      <CourseContextList course={course} units={units} />
    </>
  );
}

/** The course's race months, start temperatures and supplied route: context only, never an adjustment. */
function CourseContextList({ course, units }: { course: CourseContext; units: UnitSystem }) {
  return (
    <dl className="plan-context">
      <div><dt>Race month</dt><dd>{course.months.length ? course.months.map((m) => MONTHS[m - 1]).join(' and ') : 'No dated edition'}</dd></div>
      <div><dt>Start temperature</dt><dd>{course.start_temp_c ? `${tempRange(course.start_temp_c, units)} across ${course.weather_editions} of ${count(course.editions)} editions (one modelled reading at the scheduled start, not anyone’s exposure)` : 'No weather row'}</dd></div>
      <div><dt>Climb</dt><dd>{course.gain_m !== null ? `${elevation(course.gain_m, units)}, the sum of the 5 km sections of the supplied current route` : 'No supplied route profile'}</dd></div>
      {course.downhill_opening ? <div><dt>First 5 km</dt><dd>A downhill opening: the supplied route drops more than {units === 'mi' ? '82 ft' : '25 m'}.</dd></div> : null}
      <div className="plan-context-note"><dd>Weather and elevation are context only; no figure here is adjusted for either.</dd></div>
    </dl>
  );
}

/** All courses together: the pace band's finish window for the goal. */
function AllCourses({ all, goal, minute, units }: { all: PaceBandCell; goal: number; minute: number; units: UnitSystem }) {
  return (
    <>
      {goal % 60 ? <p className="plan-rounded">Your goal has seconds, so this uses the whole minute below it, {formatHM(minute * 60)}.</p> : null}
      <div className="plan-stats">
        <Stat label="Finishes" value={count(all.n)} sub={`${editions(all.ed)}, finished in the five minutes up to ${formatHM(minute * 60)}`} />
        {all.sd !== undefined ? <Stat label="Sustained slowdown" value={pctText(all.sd)} sub="observed share of these finishes" /> : null}
        <Stat label="At 20 km" value={formatDuration(all.e50[3], true)} sub={`median elapsed time at the 20 km mat${units === 'mi' ? ` (${miles(20)})` : ''}`} />
        <Stat label="Median finish" value={formatDuration(all.e50[8], true)} sub={all.e25 && all.e75 ? `middle half ${formatDuration(all.e25[8], true)}–${formatDuration(all.e75[8], true)}` : 'every one under the goal'} />
      </div>
      <p className="tool-note">
        Observed shares of complete finishes, not a prediction. {SLOWDOWN_DEFINITION} Source: <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">{SLOWDOWN_CITATION.label}</a>. Runners who stopped are not in the data.
      </p>
    </>
  );
}

/** The published course rows at the same goal, alphabetical, the chosen course marked. No ranks and no sorting by outcome. */
function SameGoal({ rows, minutes, chosen, units, tolerance }: { rows: CourseGoalRow[]; minutes: number; chosen: string | null; units: UnitSystem; tolerance: number }) {
  const goalText = formatHM(minutes * 60);
  const at20 = units === 'mi' ? '12.4 mi' : '20 km';
  return (
    <details className="tool-panel panel-data plan-every">
      <summary>Same goal on every course (alphabetical)</summary>
      <div className="plan-every-body">
        <span className="evidence-badge evidence-data">Pace Notes data</span>
        <p className="tool-panel-meta">Each course’s published row at {goalText}: finishes that ran 5–20 km within {Math.round(tolerance * 100)}% of its even pace. Alphabetical, not a ranking: courses differ in field, qualifying rules, weather, era and route.</p>
        <div className="tool-table-wrap" role="region" aria-label={`Same goal on every course at ${goalText}`} tabIndex={0}>
          <table className="tool-table plan-every-table">
            <thead>
              <tr><th scope="col">Course</th><th scope="col">Finishes</th><th scope="col">Under {goalText}</th><th scope="col">Sustained slowdown</th><th scope="col">After {at20}</th><th scope="col">Median finish</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.city} className={r.city === chosen ? 'is-chosen' : undefined}>
                  <th scope="row">{r.city}{r.city === chosen ? <span className="sr-only"> (your course)</span> : null}</th>
                  <td>{count(r.n)}<small>{editions(r.ed)}</small></td>
                  <td>{pctText(r.under)}</td>
                  <td>{pctText(r.sd)}</td>
                  <td>{formatMargin(r.after20)}</td>
                  <td>{formatDuration(r.fin[1], true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tool-note"><Link href={`/tools/course-chooser?goal=${goalText}`}>Open in the course chooser</Link> for each course’s race months, start temperatures, route profile and finish spread.</p>
      </div>
    </details>
  );
}
