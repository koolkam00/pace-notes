'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import Arrow from '@/components/ui/Arrow';
import { DataState, GoalBar, ShareBar } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { loadInsight } from '@/lib/insights';
import type { CourseContext, CourseGoal, CourseGoalRow } from '@/lib/tools/data';
import { planHref } from '@/lib/tools/links';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import { formatDuration, formatHM, parseDuration } from '@/lib/tools/time';
import type { UnitSystem } from '@/lib/units';
import { count } from '@/lib/viz/format';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const DATA_PATH = 'tools/course-goal.json';
/** Fallbacks before the data file loads; the loaded file's own values win. */
const GOALS_FALLBACK: [number, number] = [150, 390];
const STEP_FALLBACK = 5;
/** The 4:00 example every tool and goal page opens on (spec section 4.4). */
const DEFAULT_GOAL = 240;
const DEFAULTS = { goal: '4:00', sort: 'under', dir: '', month: '', open: '' };

type SortKey = 'name' | 'under' | 'sd' | 'after20' | 'n';
type Dir = 'asc' | 'desc';
type Opening = '' | 'downhill' | 'other';

const SORT_KEYS: SortKey[] = ['name', 'under', 'sd', 'after20', 'n'];
/** Every number sorts highest first by default, whichever end looks better, so no default order reads as a leaderboard. */
const DEFAULT_DIR: Record<SortKey, Dir> = { name: 'asc', under: 'desc', sd: 'desc', after20: 'desc', n: 'desc' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A course page with no course in the data (every edition was screened out). */
export interface ScreenedCourse { city: string; slug: string }
interface Item { row: CourseGoalRow; course: CourseContext }

const hm = (minutes: number) => formatHM(minutes * 60);
const pctText = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
/** "5–27%": the lowest and highest share, one percent sign; a single value when they round alike. */
function range2(shares: number[]): string {
  const [a, b] = [pctText(Math.min(...shares)), pctText(Math.max(...shares))];
  return a === b ? a : `${a.replace('%', '')}–${b}`;
}
const paceText = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;

const inMonth = (c: CourseContext, m: number | null) => m === null || c.months.includes(m);
const inOpening = (c: CourseContext, o: Opening) => o === '' || (o === 'downhill') === c.downhill_opening;
/** A course's name as every page writes it (the data's "New York" is New York City, as on the analyses). */
const displayCity = (city: string) => (city === 'New York' ? 'New York City' : city);
const monthText = (months: number[]) => (months.length ? months.map((m) => MONTHS[m - 1]).join(', ') : '—');

/**
 * Read ?goal= and snap it to the published 5-minute grid, saying so when the link asked for something else.
 * An empty value (a link with goal=) is not read here: the tool shows its prompt instead of a goal.
 */
function readGoal(text: string, range: [number, number], step: number): { minutes: number; note: string | null } {
  // A bare 2 to 6 in a hand-typed link means hours (goal=4 is 4:00); other bare numbers are minutes (goal=210 is 3:30).
  const seconds = /^\s*[2-6]\s*$/.test(text) ? Number(text) * 3600 : parseDuration(text, 'race');
  if (seconds === null || seconds < 3600) {
    return { minutes: DEFAULT_GOAL, note: `“${text.slice(0, 12)}” is not a marathon time (try H:MM, such as 3:30), so this shows ${hm(DEFAULT_GOAL)}.` };
  }
  const exact = seconds / 60;
  const snapped = Math.min(range[1], Math.max(range[0], Math.round(exact / step) * step));
  if (exact < range[0] - step / 2 || exact > range[1] + step / 2) {
    return { minutes: snapped, note: `Goals run from ${hm(range[0])} to ${hm(range[1])}, so ${formatDuration(seconds, true)} shows the nearest, ${hm(snapped)}.` };
  }
  if (Math.abs(snapped * 60 - seconds) >= 1) return { minutes: snapped, note: `Goals come in ${step}-minute steps, so ${formatDuration(seconds, true)} shows as ${hm(snapped)}.` };
  return { minutes: snapped, note: null };
}

function sortItems(items: Item[], key: SortKey, dir: Dir): Item[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (it: Item) => (key === 'under' ? it.row.under : key === 'sd' ? it.row.sd : key === 'after20' ? it.row.after20 : it.row.n);
  return [...items].sort((a, b) => {
    if (key === 'name') return sign * a.course.city.localeCompare(b.course.city);
    const d = value(a) - value(b);
    return d !== 0 ? sign * d : a.course.city.localeCompare(b.course.city);
  });
}

function orderLabel(key: SortKey, dir: Dir): string {
  if (key === 'name') return dir === 'asc' ? 'A to Z' : 'Z to A';
  if (key === 'after20') return dir === 'asc' ? 'Shortest first' : 'Longest first';
  if (key === 'n') return dir === 'asc' ? 'Fewest first' : 'Most first';
  return dir === 'asc' ? 'Lowest first' : 'Highest first';
}
function sortName(key: SortKey, goal: string, at20: string): string {
  return { name: 'course name', under: `share under ${goal}`, sd: 'sustained-slowdown share', after20: `time after ${at20}`, n: 'finishes' }[key];
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

function useCourseGoal(sha: string | null) {
  const [state, setState] = useState<{ data: CourseGoal | null; error: string | null }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!sha) return;
    let live = true;
    loadInsight<CourseGoal>(DATA_PATH, sha).then(
      (data) => { if (live) setState({ data, error: null }); },
      (e: unknown) => { if (live) setState({ data: null, error: e instanceof Error ? e.message : 'This data could not be loaded. Check the connection and try again.' }); },
    );
    return () => { live = false; };
  }, [sha, attempt]);
  // loadInsight drops a failed request from its cache, so a new attempt fetches again.
  const retry = () => { setState({ data: null, error: null }); setAttempt((n) => n + 1); };
  return sha ? { ...state, retry } : { data: null, error: 'The course chooser data is not part of this build, so no course can be shown.', retry: null };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/** Where each course's share sits between the lowest and the highest: one dot per course, the two ends labelled. */
function ShareStrip({ items, goalText }: { items: Item[]; goalText: string }) {
  if (items.length < 2) return null;
  const sorted = [...items].sort((a, b) => a.row.under - b.row.under);
  const lo = sorted[0], hi = sorted[sorted.length - 1];
  const span = hi.row.under - lo.row.under || 1;
  const at = (it: Item) => `${((it.row.under - lo.row.under) / span) * 100}%`;
  return (
    <figure className="viz cc-strip" aria-label={`Share that made ${goalText}, course by course: from ${pctText(lo.row.under)} in ${displayCity(lo.course.city)} to ${pctText(hi.row.under)} in ${displayCity(hi.course.city)}.`} role="img">
      <div className="cc-strip-track">
        {sorted.map((it) => <i key={it.course.slug} className={it === lo || it === hi ? 'is-end' : undefined} style={{ left: at(it) }} />)}
      </div>
      <div className="cc-strip-ends" aria-hidden="true"><span>{displayCity(lo.course.city)}</span><span>{displayCity(hi.course.city)}</span></div>
    </figure>
  );
}

export default function CourseChooser({ sha, screened }: {
  sha: string | null; screened: ScreenedCourse[];
}) {
  const { units } = useUnits();
  const [q, setQuery, ready, fromUrl] = useQueryState(DEFAULTS);
  const { data, error, retry } = useCourseGoal(sha);
  // The example: the default 4:00 goal, untouched and not from a link. Any change or linked value ends it.
  const [touched, setTouched] = useState(false);
  const setQ = (patch: Partial<typeof DEFAULTS>) => { setTouched(true); setQuery(patch); };
  const isExample = ready && !touched && fromUrl.size === 0;

  const range: [number, number] = data?.goals ?? GOALS_FALLBACK;
  const step = data?.goal_step_min ?? STEP_FALLBACK;
  const minEditions = data?.min_editions ?? 3;
  // A link with goal= (cleared) opens on a prompt with no results, not on the example goal.
  const noGoal = q.goal.trim() === '';
  const { minutes: goal, note } = noGoal ? { minutes: DEFAULT_GOAL, note: null } : readGoal(q.goal, range, step);
  const goalText = hm(goal);
  const evenKm = (goal * 60) / MARATHON_KM;

  const sort: SortKey = (SORT_KEYS as string[]).includes(q.sort) ? (q.sort as SortKey) : 'under';
  const dir: Dir = q.dir === 'asc' || q.dir === 'desc' ? q.dir : DEFAULT_DIR[sort];
  const month = /^(1[0-2]|[1-9])$/.test(q.month) ? Number(q.month) : null;
  const opening: Opening = q.open === 'downhill' || q.open === 'other' ? q.open : '';

  const goals = useMemo(() => {
    const out: number[] = [];
    for (let m = range[0]; m <= range[1]; m += step) out.push(m);
    return out;
  }, [range, step]);
  const setGoal = (m: number) => setQ({ goal: hm(Math.min(range[1], Math.max(range[0], m))) });
  // The steppers stay focusable at the ends of the range (aria-disabled, not disabled), so keyboard focus never drops to the page.
  const canFaster = !noGoal && goal > range[0];
  const canSlower = !noGoal && goal < range[1];

  // Controls that unmount when used (Clear filters, Try again) hand focus to a control that stays.
  const monthRef = useRef<HTMLSelectElement>(null);
  const goalRef = useRef<HTMLSelectElement>(null);
  const clearFilters = () => { monthRef.current?.focus(); setQ({ month: '', open: '' }); };
  const retryLoad = () => { goalRef.current?.focus(); retry?.(); };

  const courseByCity = useMemo(() => new Map((data?.courses ?? []).map((c) => [c.city, c])), [data]);
  const published: Item[] = useMemo(() => (data ? data.rows.filter((r) => r.goal === goal).flatMap((row) => {
    const course = courseByCity.get(row.city);
    return course ? [{ row, course }] : [];
  }) : []), [data, goal, courseByCity]);
  const visible = useMemo(() => sortItems(published.filter(({ course }) => inMonth(course, month) && inOpening(course, opening)), sort, dir),
    [published, month, opening, sort, dir]);
  // Filter options come from the courses published at this goal, with how many each leaves (given the other filter).
  // A month from the link stays listed at 0, so the select can still show it.
  const monthOptions = useMemo(() => {
    const months = new Set(published.flatMap((p) => p.course.months));
    if (month !== null) months.add(month);
    return [...months].sort((a, b) => a - b).map((m) => ({ m, n: published.filter((p) => inMonth(p.course, m) && inOpening(p.course, opening)).length }));
  }, [published, month, opening]);
  const openingCount = (o: Opening) => published.filter((p) => inMonth(p.course, month) && inOpening(p.course, o)).length;

  // Courses with no row at this goal: too few finishes at this pace, or (structural) too few editions or none screened in.
  const unpublished = useMemo(() => {
    if (!data) return [] as string[];
    const out = data.unavailable.filter((x) => x.goal === goal).map((u) => u.city);
    for (const c of data.courses) if (c.editions < minEditions && !out.includes(c.city)) out.push(c.city);
    for (const s of screened) if (!out.includes(s.city)) out.push(s.city);
    return [...new Set(out)].sort((a, b) => a.localeCompare(b));
  }, [data, goal, minEditions, screened]);

  // The night card: of finishes on the goal's pace through 20K, the share that made it, pooled, and its spread by course.
  const pooled = useMemo(() => {
    if (!published.length) return null;
    const n = published.reduce((sum, p) => sum + p.row.n, 0);
    return { n, under: published.reduce((sum, p) => sum + p.row.n * p.row.under, 0) / n };
  }, [published]);
  const maxUnder = Math.max(0.01, ...published.map((p) => p.row.under));

  const filtered = month !== null || opening !== '';
  const at20 = units === 'mi' ? '12.4 mi' : '20 km';
  const statusText = `${filtered ? `Showing ${visible.length} of ${published.length}` : `Showing all ${published.length}`} published courses at ${goalText}, ${sort === 'name' ? (dir === 'asc' ? 'in alphabetical order' : 'in reverse alphabetical order') : `by ${sortName(sort, goalText, at20)}, ${orderLabel(sort, dir).toLowerCase()}`}.`;
  // The one live region: a short summary that changes with the goal, sort and filters (load and error states are DataState's).
  const srStatus = !data ? '' : noGoal ? `Choose a goal from ${hm(range[0])} to ${hm(range[1])} to compare courses.`
    : `${published.length} courses have a row at ${goalText}. ${statusText}${sort !== 'name' ? ' Not a ranking of course difficulty.' : ''}`;
  const setSort = (key: SortKey) => setQ({ sort: key, dir: '' });

  return (
    <div className="course-chooser">
      <p className="sr-only" role="status">{srStatus}</p>
      <div className="tool-workspace">
        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Course chooser goal">
          <h2>Your goal</h2>
          <div className="tool-field">
            <label htmlFor="course-chooser-goal">Marathon goal time</label>
            <div className="tool-stepper course-chooser-goal">
              <button type="button" aria-disabled={!canFaster || undefined} onClick={() => { if (canFaster) setGoal(goal - step); }}
                aria-label={noGoal ? `${step} minutes faster: choose a goal first` : canFaster ? `${step} minutes faster: ${hm(goal - step)}` : `${step} minutes faster: ${hm(range[0])} is the fastest goal`}>−</button>
              <select id="course-chooser-goal" ref={goalRef} value={noGoal ? '' : goal} onChange={(e) => { if (e.target.value) setGoal(Number(e.target.value)); }} aria-describedby="course-chooser-goal-hint">
                {noGoal ? <option value="" disabled>Choose</option> : null}
                {goals.map((m) => <option key={m} value={m}>{hm(m)}</option>)}
              </select>
              <button type="button" aria-disabled={!canSlower || undefined} onClick={() => { if (canSlower) setGoal(goal + step); }}
                aria-label={noGoal ? `${step} minutes slower: choose a goal first` : canSlower ? `${step} minutes slower: ${hm(goal + step)}` : `${step} minutes slower: ${hm(range[1])} is the slowest goal`}>+</button>
            </div>
            <p className="tool-field-hint" id="course-chooser-goal-hint">{noGoal ? `${step}-minute steps from ${hm(range[0])} to ${hm(range[1])}.` : `Even pace ${paceText(evenKm, units)} · ${paceText(evenKm, units === 'mi' ? 'km' : 'mi')}.`}</p>
          </div>
          {note ? <p className="tool-field-hint">{note}</p> : null}
        </form>

        <div className="tool-results">
          <DataState error={error} loading={!data && !error}>
            {data && noGoal ? <p className="tool-empty">Choose a goal from {hm(range[0])} to {hm(range[1])} to see how finishes at that pace held up on each course.</p>
            : data && pooled ? (
              <section className="tool-reading night course-chooser-headline" aria-labelledby="course-chooser-title">
                <div className="tool-reading-head">
                  <p className="tool-reading-kicker">{isExample ? 'Example · ' : ''}Goal {goalText} · {published.length} courses</p>
                </div>
                <h2 className="tool-reading-figure course-chooser-title" id="course-chooser-title">
                  {range2(published.map((p) => p.row.under))}
                  <small>of finishes on {goalText} pace at 20K made {goalText}, course by course</small>
                </h2>
                <ShareStrip items={published} goalText={goalText} />
                {/* The badge at the card's foot, as on every other tool card. */}
                <EvidenceTag kind="data" />
              </section>
            ) : data ? <p className="tool-empty">No course has a published row at {goalText}.</p> : null}
          </DataState>
          {error && retry ? <button type="button" className="btn btn-secondary is-compact course-chooser-retry" onClick={retryLoad}>Try again</button> : null}
          {data && !noGoal ? (
            <>
          {/* Every row, heading and axis below follows the visitor's goal, so session replays leave these out. */}
          <div className="course-chooser-list ph-no-capture" data-tool-controls>
            <section className="tool-panel" aria-labelledby="course-chooser-courses">
              <h2 className="tool-panel-title" id="course-chooser-courses">Every course at {goalText}</h2>
              {/* One control on the beat: the sort. The two filters wait behind one disclosure; a link's order (dir) still applies. */}
              <div className="course-chooser-toolbar no-print">
                <div className="tool-field">
                  <label htmlFor="course-chooser-sort">Sort by</label>
                  <select id="course-chooser-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="under">Share under {goalText}</option>
                    <option value="sd">Sustained-slowdown share</option>
                    <option value="after20">Time after {at20}</option>
                    <option value="n">Finishes</option>
                    <option value="name">Course name</option>
                  </select>
                </div>
                <details className="tool-more course-chooser-filters" open={filtered || undefined}>
                  <summary>Filter by race month or first 5K{filtered ? <span className="course-chooser-filter-count"> · {[month !== null ? MONTHS_LONG[month - 1] : null, opening === 'downhill' ? 'downhill start' : opening === 'other' ? 'no downhill start' : null].filter(Boolean).join(', ')}</span> : null}</summary>
                  <div className="tool-more-body course-chooser-filter-fields">
                    <div className="tool-field">
                      <label htmlFor="course-chooser-month">Race month</label>
                      <select id="course-chooser-month" ref={monthRef} value={month === null ? '' : String(month)} onChange={(e) => setQ({ month: e.target.value })}>
                        <option value="">Any month</option>
                        {monthOptions.map(({ m, n }) => <option key={m} value={m}>{MONTHS_LONG[m - 1]} ({n})</option>)}
                      </select>
                    </div>
                    <div className="tool-field">
                      <label htmlFor="course-chooser-open">First 5K</label>
                      <select id="course-chooser-open" value={opening} onChange={(e) => setQ({ open: e.target.value })}>
                        <option value="">Any</option>
                        <option value="downhill">Downhill only ({openingCount('downhill')})</option>
                        <option value="other">Not downhill ({openingCount('other')})</option>
                      </select>
                    </div>
                  </div>
                </details>
              </div>
              <p className="tool-note course-chooser-status">
                {statusText}{sort !== 'name' ? ' Not a ranking of course difficulty.' : ''}
                {filtered ? <> <button type="button" className="btn btn-tertiary course-chooser-clear no-print" onClick={clearFilters}>Clear filters</button></> : null}
              </p>

              {visible.length ? (
                <ol className="course-chooser-rows">
                  {visible.map(({ row, course }) => (
                    <li key={course.slug}>
                      <Link className="cc-row" href={planHref(course.city, goal) ?? '/tools/plan'}>
                        <span className="cc-name">{displayCity(course.city)}</span>
                        <span className="cc-bar" aria-hidden="true"><i style={{ width: `${(row.under / maxUnder) * 100}%` }} /></span>
                        <span className="cc-share"><b>{pctText(row.under)}</b><span className="sr-only"> made {goalText}</span></span>
                        <span className="cc-sub">{pctText(row.sd)} sustained slowdown · {monthText(course.months)}{course.downhill_opening ? ' · downhill start' : ''}<span className="sr-only"> · {count(row.n)} finishes</span></span>
                        {/* The whole row is the link: its name says where it goes, so no visible label repeats on every row. */}
                        <span className="cc-plan"><span className="sr-only">Plan {goalText} in {displayCity(course.city)}</span><Arrow /></span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="tool-empty">
                  No published course at {goalText} matches these filters{month !== null ? ` (races in ${MONTHS_LONG[month - 1]})` : ''}.{' '}
                  <button type="button" className="btn btn-tertiary course-chooser-clear" onClick={clearFilters}>Clear filters</button>
                </p>
              )}
              {unpublished.length ? <p className="tool-note">Not published at {goalText}: {unpublished.map(displayCity).join(', ')}.</p> : null}
            </section>
          </div>
          <ShareBar />
            </>
          ) : null}
          {data && !noGoal ? (
            <GoalBar label="Goal" step={step * 60} onStep={(d) => setGoal(goal + d / 60)} labels={['faster', 'slower']} disabled={[!canFaster, !canSlower]}>
              <b>{goalText}</b><span>{paceText(evenKm, units)}</span>
            </GoalBar>
          ) : null}
        </div>
      </div>
    </div>
  );
}
