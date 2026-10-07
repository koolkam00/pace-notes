'use client';

import { useEffect, useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DataState, EvidencePanel, ShareBar, Stat } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { loadInsight } from '@/lib/insights';
import type { CourseContext, CourseGoal, CourseGoalRow } from '@/lib/tools/data';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import { formatDuration, formatHM, formatMargin, parseDuration } from '@/lib/tools/time';
import { KM_PER_MILE, METRES_PER_FOOT, elevationLabel, type UnitSystem } from '@/lib/units';
import { count } from '@/lib/viz/format';

/* ------------------------------------------------------------------ */
/* Constants and pure helpers                                          */
/* ------------------------------------------------------------------ */

const DATA_PATH = 'tools/course-goal.json';
/** Fallbacks before the data file loads; the loaded file's own values win. */
const GOALS_FALLBACK: [number, number] = [150, 390];
const STEP_FALLBACK = 5;
const DEFAULT_GOAL = 210;
/** From this goal (minutes) the panel notes that course closing times shape what is recorded. */
const SLOW_GOAL = 345;
const PRESETS = [180, 195, 210, 225, 240, 270, 300];
const DEFAULTS = { goal: '3:30', sort: 'name', dir: '', month: '', open: '' };

type SortKey = 'name' | 'under' | 'sd' | 'after20' | 'n';
type Dir = 'asc' | 'desc';
type Opening = '' | 'downhill' | 'other';

const SORT_KEYS: SortKey[] = ['name', 'under', 'sd', 'after20', 'n'];
/** Every number sorts highest first by default, whichever end looks better, so no default order reads as a leaderboard. */
const DEFAULT_DIR: Record<SortKey, Dir> = { name: 'asc', under: 'desc', sd: 'desc', after20: 'desc', n: 'desc' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MINUS = '−';

export interface ScreenedCourse { city: string; slug: string; reason: string }
interface Item { row: CourseGoalRow; course: CourseContext }
interface Scale { lo: number; hi: number; ticks: number[] }

const hm = (minutes: number) => formatHM(minutes * 60);
const pctText = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const paceText = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;
/** A distance stated in metric with the miles equivalent in miles mode: "20 km (12.4 mi)". */
const kmText = (km: number, units: UnitSystem) => (units === 'mi' ? `${km} km (${(km / KM_PER_MILE).toFixed(1)} mi)` : `${km} km`);

/** Whole feet or metres through the site's elevation label (source values stay metric). */
function elev(metres: number, units: UnitSystem, signed = false): string {
  // "+ 0" turns a rounded −0 into 0, so a flat course never reads "−0 ft".
  const whole = (units === 'mi' ? Math.round(metres / METRES_PER_FOOT) * METRES_PER_FOOT : Math.round(metres)) + 0;
  // A no-break space keeps the number and its unit together when a card line wraps.
  const label = elevationLabel(whole, units).replace('-', MINUS).replace(/ (ft|m)$/, '\u00a0$1');
  return signed && Math.round(units === 'mi' ? metres / METRES_PER_FOOT : metres) > 0 ? `+${label}` : label;
}
const elevUnit = (units: UnitSystem) => (units === 'mi' ? 'ft' : 'm');
function elevNumber(metres: number, units: UnitSystem): string {
  return elev(metres, units).replace(/\s*(ft|m)$/, '');
}

/** "45–62°F" or "7–16°C"; a single value when the range rounds to one number. */
function tempRange(range: [number, number] | null, units: UnitSystem): string | null {
  if (!range) return null;
  const t = (c: number) => Math.round(units === 'mi' ? c * 1.8 + 32 : c);
  const [a, b] = [t(range[0]), t(range[1])];
  const sign = (v: number) => String(v).replace('-', MINUS);
  const unit = units === 'mi' ? '°F' : '°C';
  return a === b ? `${sign(a)}${unit}` : `${sign(a)}${a < 0 || b < 0 ? ' to ' : '–'}${sign(b)}${unit}`;
}
const inMonth = (c: CourseContext, m: number | null) => m === null || c.months.includes(m);
const inOpening = (c: CourseContext, o: Opening) => o === '' || (o === 'downhill') === c.downhill_opening;
const monthText = (months: number[], long = false) => (months.length ? months.map((m) => (long ? MONTHS_LONG : MONTHS)[m - 1]).join(long ? ' and ' : ', ') : '—');

/** Read ?goal= and snap it to the published 5-minute grid, saying so when the link asked for something else. */
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

/** Plain-words reason for a course without a row at this goal. Small finish counts are never printed. */
function reasonText(reason: string, minEditions: number): string {
  const m = reason.match(/^(\d+) editions? with at least (\d+) finishes at this pace; (\d+) finishes$/);
  if (!m) return reason;
  const [ed, per, n] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ed === 0) return `No edition had ${per} or more finishes at this pace.`;
  if (ed < minEditions) return `${ed === 1 ? 'Only one edition' : `Only ${ed} editions`} had ${per} or more finishes at this pace${n >= 100 ? ` (${count(n)} finishes)` : ''}; ${minEditions} are needed.`;
  return `${ed} editions had ${per} or more finishes at this pace, but fewer than 100 finishes in all.`;
}

/** One shared time scale for every bar at this goal, with round ticks. */
function finishScale(rows: CourseGoalRow[], goalS: number): Scale {
  const lo0 = Math.min(goalS, ...rows.map((r) => r.fin[0]));
  const hi0 = Math.max(goalS, ...rows.map((r) => r.fin[2]));
  const pad = Math.max(60, (hi0 - lo0) * 0.04);
  const [lo, hi] = [lo0 - pad, hi0 + pad];
  const step = [300, 600, 900, 1200, 1800, 3600].find((s) => (hi - lo) / s <= 4.5) ?? 3600;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return { lo, hi, ticks };
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
/* Charts                                                              */
/* ------------------------------------------------------------------ */

const BAR_W = 168;

/** Finish-time spread for one course: 10th–90th percentile bar, median dot, goal line. */
function FinishBar({ fin, goalS, scale, variant = 'row', city, goalLabel }: {
  fin: [number, number, number]; goalS: number; scale: Scale; variant?: 'row' | 'card'; city: string; goalLabel: string;
}) {
  const W = variant === 'row' ? BAR_W : 300;
  const H = variant === 'row' ? 22 : 54;
  const padX = variant === 'row' ? 7 : 16;
  const x = (s: number) => padX + ((s - scale.lo) / (scale.hi - scale.lo)) * (W - 2 * padX);
  const cy = variant === 'row' ? H / 2 : 27;
  const label = `${city}: 10th percentile finish ${formatDuration(fin[0], true)}, median ${formatDuration(fin[1], true)}, 90th percentile ${formatDuration(fin[2], true)}. The goal, ${goalLabel}, is ${fin[1] > goalS ? 'faster than the median' : 'slower than the median'}.`;
  return (
    <svg className={`course-chooser-bar is-${variant}`} viewBox={`0 0 ${W} ${H}`} width={variant === 'row' ? W : undefined} role="img" aria-label={label}>
      {variant === 'card' ? (
        <>
          {scale.ticks.map((t) => (
            <g key={t} className={t === goalS ? 'is-goal' : undefined}>
              <line className="course-chooser-grid" x1={x(t)} x2={x(t)} y1={16} y2={40} />
              <text className="course-chooser-tick" x={x(t)} y={H - 2} textAnchor="middle">{formatHM(t)}</text>
            </g>
          ))}
          <text className="course-chooser-goal-text" x={Math.min(W - 30, Math.max(30, x(goalS)))} y={10} textAnchor="middle">{goalLabel} goal</text>
        </>
      ) : null}
      <line className="course-chooser-goal-line" x1={x(goalS)} x2={x(goalS)} y1={variant === 'row' ? 1 : 14} y2={variant === 'row' ? H - 1 : 40} />
      <line className="course-chooser-range" x1={x(fin[0])} x2={x(fin[2])} y1={cy} y2={cy} />
      <line className="course-chooser-whisker" x1={x(fin[0])} x2={x(fin[0])} y1={cy - 5} y2={cy + 5} />
      <line className="course-chooser-whisker" x1={x(fin[2])} x2={x(fin[2])} y1={cy - 5} y2={cy + 5} />
      <circle className="course-chooser-median" cx={x(fin[1])} cy={cy} r={4.6} />
    </svg>
  );
}

/** The shared axis above the table's bar column. */
function FinishAxis({ scale, goalS }: { scale: Scale; goalS: number }) {
  const W = BAR_W;
  const padX = 7;
  const x = (s: number) => padX + ((s - scale.lo) / (scale.hi - scale.lo)) * (W - 2 * padX);
  return (
    <svg className="course-chooser-axis" viewBox={`0 0 ${W} 20`} width={W} aria-hidden="true">
      {scale.ticks.map((t) => (
        <g key={t} className={t === goalS ? 'is-goal' : undefined}>
          <text x={x(t)} y={10} textAnchor="middle">{formatHM(t)}</text>
          <line x1={x(t)} x2={x(t)} y1={13} y2={19} />
        </g>
      ))}
      {scale.ticks.includes(goalS) ? null : <path className="course-chooser-goal-mark" d={`M${x(goalS) - 4} 13 L${x(goalS) + 4} 13 L${x(goalS)} 19 Z`} />}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CourseChooser({ sha, pages, screened, bandGoals }: {
  sha: string | null; pages: string[]; screened: ScreenedCourse[];
  /** Goals per course slug where the pace band has observed course data; null when unknown (links then go to the course). */
  bandGoals: Record<string, number[]> | null;
}) {
  const { units } = useUnits();
  const [q, setQ] = useQueryState(DEFAULTS);
  const { data, error, retry } = useCourseGoal(sha);

  const range: [number, number] = data?.goals ?? GOALS_FALLBACK;
  const step = data?.goal_step_min ?? STEP_FALLBACK;
  const minEditions = data?.min_editions ?? 3;
  const minEditionFinishes = data?.min_edition_finishes ?? 20;
  const tolerance = data?.tolerance ?? 0.02;
  const { minutes: goal, note } = readGoal(q.goal, range, step);
  const goalS = goal * 60;
  const goalText = hm(goal);
  const evenKm = goalS / MARATHON_KM;
  const bandText = `${formatDuration(perUnit(evenKm * (1 - tolerance), units))}–${formatDuration(perUnit(evenKm * (1 + tolerance), units))}/${units}`;

  const sort: SortKey = (SORT_KEYS as string[]).includes(q.sort) ? (q.sort as SortKey) : 'name';
  const dir: Dir = q.dir === 'asc' || q.dir === 'desc' ? q.dir : DEFAULT_DIR[sort];
  const month = /^(1[0-2]|[1-9])$/.test(q.month) ? Number(q.month) : null;
  const opening: Opening = q.open === 'downhill' || q.open === 'other' ? q.open : '';

  const goals = useMemo(() => {
    const out: number[] = [];
    for (let m = range[0]; m <= range[1]; m += step) out.push(m);
    return out;
  }, [range, step]);
  const setGoal = (m: number) => setQ({ goal: hm(Math.min(range[1], Math.max(range[0], m))) });

  const courseByCity = useMemo(() => new Map((data?.courses ?? []).map((c) => [c.city, c])), [data]);
  const published: Item[] = useMemo(() => (data ? data.rows.filter((r) => r.goal === goal).flatMap((row) => {
    const course = courseByCity.get(row.city);
    return course ? [{ row, course }] : [];
  }) : []), [data, goal, courseByCity]);
  const visible = useMemo(() => sortItems(published.filter(({ course }) => inMonth(course, month) && inOpening(course, opening)), sort, dir),
    [published, month, opening, sort, dir]);
  const scale = useMemo(() => finishScale(published.map((p) => p.row), goalS), [published, goalS]);
  // Filter options come from the courses published at this goal, with how many each leaves (given the other filter).
  // A month from the link stays listed at 0, so the select can still show it.
  const monthOptions = useMemo(() => {
    const months = new Set(published.flatMap((p) => p.course.months));
    if (month !== null) months.add(month);
    return [...months].sort((a, b) => a - b).map((m) => ({ m, n: published.filter((p) => inMonth(p.course, m) && inOpening(p.course, opening)).length }));
  }, [published, month, opening]);
  const openingCount = (o: Opening) => published.filter((p) => inMonth(p.course, month) && inOpening(p.course, o)).length;

  const unavailable = useMemo(() => {
    if (!data) return { pace: [], structural: [] as { city: string; reason: string }[] };
    const pace: { city: string; reason: string }[] = [];
    const structural: { city: string; reason: string }[] = [];
    for (const u of data.unavailable.filter((x) => x.goal === goal).sort((a, b) => a.city.localeCompare(b.city))) {
      const c = courseByCity.get(u.city);
      if (c && c.editions < minEditions) structural.push({ city: u.city, reason: `${c.editions === 1 ? 'Only one edition' : `Only ${c.editions} editions`} passed the data screens; ${minEditions} are needed for any goal.` });
      else pace.push({ city: u.city, reason: reasonText(u.reason, minEditions) });
    }
    for (const s of screened) structural.push({ city: s.city, reason: s.reason });
    structural.sort((a, b) => a.city.localeCompare(b.city));
    return { pace, structural };
  }, [data, goal, courseByCity, minEditions, screened]);

  const pageSet = useMemo(() => new Set(pages), [pages]);
  const slugFor = (city: string) => courseByCity.get(city)?.slug ?? screened.find((s) => s.city === city)?.slug ?? null;
  const courseLink = (city: string) => {
    const slug = slugFor(city);
    return slug && pageSet.has(slug) ? <Link href={`/courses/${slug}`}>{city}</Link> : <>{city}</>;
  };
  /** The pace band for this goal on the course, or the all-course band when the course has too few finishes just under the goal. */
  const band = (course: CourseContext) => {
    const own = bandGoals === null || (bandGoals[course.slug] ?? []).includes(goal);
    return own
      ? { href: `/tools/pace-band?goal=${goalText}&course=${course.slug}`, own, why: '' }
      : { href: `/tools/pace-band?goal=${goalText}`, own, why: `fewer than 100 ${course.city} finishes came in within five minutes under ${goalText}` };
  };

  // Headline: ranges across every published course at this goal (filters only narrow the list below).
  const stats = useMemo(() => {
    if (!published.length) return null;
    const under = published.map((p) => p.row.under);
    const sd = published.map((p) => p.row.sd);
    const med = published.map((p) => p.row.fin[1]);
    const belowHalf = under.filter((u) => u < 0.5).length;
    return {
      under: [Math.min(...under), Math.max(...under)] as const, sd: [Math.min(...sd), Math.max(...sd)] as const,
      med: [Math.min(...med), Math.max(...med)] as const, belowHalf, n: published.reduce((s, p) => s + p.row.n, 0),
    };
  }, [published]);
  const totalCourses = (data?.courses.length ?? 0) + screened.length;
  const range2 = (a: number, b: number, f: (v: number) => string) => (f(a) === f(b) ? f(a) : `${f(a)}–${f(b)}`);

  const filtered = month !== null || opening !== '';
  const at20 = units === 'mi' ? '12.4\u00a0mi' : '20\u00a0km';
  const lastStretch = units === 'mi' ? `${((MARATHON_KM - 20) / KM_PER_MILE).toFixed(1)} mi` : '22.2 km';
  const statusText = `${filtered ? `Showing ${visible.length} of ${published.length}` : `Showing all ${published.length}`} published courses at ${goalText}, ${sort === 'name' ? (dir === 'asc' ? 'in alphabetical order' : 'in reverse alphabetical order') : `by ${sortName(sort, goalText, at20)}, ${orderLabel(sort, dir).toLowerCase()}`}.`;
  // The one live region: a short summary that changes with the goal, sort and filters (load and error states are DataState's).
  const srStatus = data ? `${published.length} of ${totalCourses} courses have a row at ${goalText}. ${statusText}${sort !== 'name' ? ' This is not a ranking of course difficulty; courses differ in field, qualifying rules, weather, era and route.' : ''}` : '';
  const setSort = (key: SortKey) => setQ({ sort: key, dir: '' });
  const headerSort = (key: SortKey) => {
    const next: Dir = dir === 'asc' ? 'desc' : 'asc';
    if (key === sort) setQ({ dir: next === DEFAULT_DIR[sort] ? '' : next });
    else setSort(key);
  };
  const ariaSort = (key: SortKey) => (key === sort ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') as 'ascending' | 'descending' | 'none';

  const defs = (
    <dl className="course-chooser-defs">
      <div><dt>Under {goalText}</dt><dd>Share of these finishes that came in under {goalText}, editions pooled.</dd></div>
      <div><dt>Sustained slowdown</dt><dd>Share with a 5 km section after {kmText(20, units)} at least 25% slower than their own 5–20 km pace, over 5 km or more in all. Editions counted equally.</dd></div>
      <div><dt>After {at20}</dt><dd>Median extra time over the last {lastStretch} beyond the 5–20 km pace. Editions counted equally.</dd></div>
      <div><dt>Finish spread</dt><dd>10th to 90th percentile finish and the median dot, all rows on one scale. The line marks {goalText}.</dd></div>
    </dl>
  );

  /** A sortable column head (a plain render helper, so focus stays on the button across re-renders). */
  const sortHead = (k: SortKey, label: string, sub: string) => (
    <th scope="col" aria-sort={ariaSort(k)} className={k === sort ? 'is-sorted' : undefined}>
      <button type="button" className="course-chooser-sort-btn" onClick={() => headerSort(k)}>
        {label}<span className="course-chooser-arrow" aria-hidden="true">{k === sort ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
      <span className="course-chooser-sub">{sub}</span>
    </th>
  );

  return (
    <div className="course-chooser">
      <p className="sr-only" role="status">{srStatus}</p>
      <div className="tool-workspace course-chooser-workspace">
        <form className="tool-inputs course-chooser-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Course chooser goal">
          <h2>Your goal</h2>
          <div className="tool-field">
            <label htmlFor="course-chooser-goal">Marathon goal time</label>
            <div className="course-chooser-goal">
              <button type="button" disabled={goal <= range[0]} aria-label={`${step} minutes faster: ${hm(Math.max(range[0], goal - step))}`} onClick={() => setGoal(goal - step)}>−</button>
              <select id="course-chooser-goal" value={goal} onChange={(e) => setGoal(Number(e.target.value))} aria-describedby="course-chooser-goal-hint">
                {goals.map((m) => <option key={m} value={m}>{hm(m)}</option>)}
              </select>
              <button type="button" disabled={goal >= range[1]} aria-label={`${step} minutes slower: ${hm(Math.min(range[1], goal + step))}`} onClick={() => setGoal(goal + step)}>+</button>
            </div>
            <p className="tool-field-hint" id="course-chooser-goal-hint">{step}-minute steps from {hm(range[0])} to {hm(range[1])}. Even pace for {goalText} is {paceText(evenKm, units)} ({paceText(evenKm, units === 'mi' ? 'km' : 'mi')}).</p>
          </div>
          <div className="tool-presets" role="group" aria-label="Common goals">
            {PRESETS.map((m) => <button key={m} type="button" aria-pressed={goal === m} onClick={() => setGoal(m)}>{hm(m)}</button>)}
          </div>
          {note ? <p className="course-chooser-note">{note}</p> : null}
        </form>

        <div className="tool-results">
          <DataState error={error} loading={!data && !error}>
            {data && stats ? (
              <div className="tool-headline course-chooser-headline">
                <div className="course-chooser-head">
                  <span className="evidence-badge evidence-data">Pace Notes data</span>
                  <p className="course-chooser-kicker">Goal {goalText} · even pace {paceText(evenKm, units)} <span>(arithmetic)</span></p>
                  <h2 className="course-chooser-title">{published.length} of {totalCourses} courses have enough finishes at {goalText} pace</h2>
                </div>
                <div className="course-chooser-stats">
                  <Stat label={`Finished under ${goalText}`} value={range2(stats.under[0], stats.under[1], pctText)} sub="range across courses" />
                  <Stat label="Sustained slowdown" value={range2(stats.sd[0], stats.sd[1], pctText)} sub="range across courses" />
                  <Stat label="Median finish" value={range2(stats.med[0], stats.med[1], (s) => formatHM(s))} sub="range of course medians" />
                </div>
                <p className="course-chooser-foot">
                  Each course row counts finishes that ran the 5–20 km stretch at {bandText}, within {Math.round(tolerance * 100)}% of even pace for {goalText}: {count(stats.n)} finishes in all.{' '}
                  {stats.belowHalf === published.length ? `On every published course, fewer than half of them finished under ${goalText}.` : `On ${stats.belowHalf} of ${published.length} courses, fewer than half of them finished under ${goalText}.`}{' '}
                  These are observed shares of complete finishes, not anyone’s chance.
                </p>
              </div>
            ) : data ? <p className="tool-empty">No course has a published row at {goalText}.</p> : null}
          </DataState>
          {error && retry ? <button type="button" className="button-secondary course-chooser-retry" onClick={retry}>Try again</button> : null}
        </div>
      </div>

      {data ? (
        <>
          <div className="course-chooser-list">
            <EvidencePanel kind="data" id="course-chooser-courses" title={`Every course at ${goalText}`}
              meta={`One row per course with at least ${minEditions} editions of ${minEditionFinishes} or more finishes at this pace and 100 finishes in all. The order is alphabetical unless you choose another.`}>
              <div className="course-chooser-toolbar no-print">
                <div className="tool-field course-chooser-sort">
                  <label htmlFor="course-chooser-sort">Sort by</label>
                  <select id="course-chooser-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="name">Course name</option>
                    <option value="under">Share under {goalText}</option>
                    <option value="sd">Sustained-slowdown share</option>
                    <option value="after20">Time after {at20}</option>
                    <option value="n">Finishes</option>
                  </select>
                </div>
                <div className="tool-field course-chooser-order">
                  <span className="tool-label" aria-hidden="true">Order</span>
                  <Choice label="Order" small value={dir} onChange={(v) => setQ({ dir: v === DEFAULT_DIR[sort] ? '' : v })}
                    options={(sort === 'name' ? ['asc', 'desc'] : ['desc', 'asc']).map((d) => ({ value: d as Dir, label: orderLabel(sort, d as Dir) }))} />
                </div>
                <div className="tool-field course-chooser-filter">
                  <label htmlFor="course-chooser-month">Race month</label>
                  <select id="course-chooser-month" value={month === null ? '' : String(month)} onChange={(e) => setQ({ month: e.target.value })}>
                    <option value="">Any month</option>
                    {monthOptions.map(({ m, n }) => <option key={m} value={m}>{MONTHS_LONG[m - 1]} ({n})</option>)}
                  </select>
                </div>
                <div className="tool-field course-chooser-filter">
                  <label htmlFor="course-chooser-open">First 5 km</label>
                  <select id="course-chooser-open" value={opening} onChange={(e) => setQ({ open: e.target.value })}>
                    <option value="">Any</option>
                    <option value="downhill">Downhill only ({openingCount('downhill')})</option>
                    <option value="other">Not downhill ({openingCount('other')})</option>
                  </select>
                </div>
              </div>

              <div className="course-chooser-status-row">
                <p className="course-chooser-status">{statusText}</p>
                {filtered ? <button type="button" className="button-secondary course-chooser-clear no-print" onClick={() => setQ({ month: '', open: '' })}>Clear filters</button> : null}
              </div>

              {sort !== 'name' ? (
                <div className="course-chooser-caveat" role="note">
                  <strong>Sorted by {sortName(sort, goalText, at20)}. This is not a ranking of course difficulty.</strong> Courses differ in field composition, qualifying rules (e.g. Boston), weather, era and route; edition balancing does not remove this. The figures describe past finishes, not what you will run.
                </div>
              ) : null}

              {goal >= SLOW_GOAL ? (
                <p className="course-chooser-limit"><strong>Slow goals meet closing times.</strong> Finishes after a course closes are not recorded, so on a course whose time limit is near {goalText}, a row describes only the finishes inside the limit. Runners who stopped are not in the data either.</p>
              ) : null}

              <div className="course-chooser-defs-wide">{defs}</div>
              <details className="course-chooser-defs-narrow">
                <summary>What the figures mean</summary>
                {defs}
              </details>

              {visible.length ? (
                <>
                  <div className="tool-table-wrap course-chooser-table-wrap">
                    <table className="tool-table course-chooser-table">
                      <caption>
                        Pace Notes data: complete finishes with all nine 5 km checkpoints. Start temperatures are one modelled observation per edition at the scheduled start; the route profile is the supplied current route, whose historical validity is unknown. Both are context only: no figure is adjusted for weather or elevation.
                      </caption>
                      <thead>
                        <tr>
                          {sortHead('name', 'Course', 'race month')}
                          {sortHead('n', 'Finishes', 'editions')}
                          {sortHead('under', `Under ${goalText}`, 'pooled share')}
                          {sortHead('sd', 'Sustained slowdown', 'share')}
                          {sortHead('after20', `After ${at20}`, 'median extra')}
                          <th scope="col" className="course-chooser-th-fin">Median finish<span className="course-chooser-sub">10th–90th</span></th>
                          <th scope="col" className="course-chooser-th-bar"><span className="sr-only">Finish spread against the goal</span><FinishAxis scale={scale} goalS={goalS} /></th>
                          <th scope="col">Start temp<span className="course-chooser-sub">all course editions</span></th>
                          <th scope="col">Route profile<span className="course-chooser-sub">climb / descent</span></th>
                          <th scope="col"><span className="sr-only">Plan</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(({ row, course }) => {
                          const temps = tempRange(course.start_temp_c, units);
                          const b = band(course);
                          return (
                            <tr key={course.slug}>
                              <th scope="row">
                                <span className="course-chooser-city">{courseLink(course.city)}</span>
                                <span className="course-chooser-sub">{monthText(course.months)}</span>
                              </th>
                              <td>{count(row.n)}<span className="course-chooser-sub">{plural(row.ed, 'edition')}</span></td>
                              <td className={sort === 'under' ? 'is-sorted' : undefined}><b>{pctText(row.under)}</b></td>
                              <td className={sort === 'sd' ? 'is-sorted' : undefined}><b>{pctText(row.sd)}</b></td>
                              <td className={sort === 'after20' ? 'is-sorted' : undefined}><b>{formatMargin(row.after20)}</b></td>
                              <td>{formatDuration(row.fin[1], true)}<span className="course-chooser-sub">{formatDuration(row.fin[0], true)}–{formatDuration(row.fin[2], true)}</span></td>
                              <td className="course-chooser-td-bar"><FinishBar fin={row.fin} goalS={goalS} scale={scale} city={course.city} goalLabel={goalText} /></td>
                              <td>{temps ?? '—'}<span className="course-chooser-sub">{temps ? `${course.weather_editions} of ${count(course.editions)} course editions` : 'no weather row'}</span></td>
                              <td>{course.gain_m !== null && course.loss_m !== null ? `${elevNumber(course.gain_m, units)} / ${elev(course.loss_m, units)}` : '—'}
                                <span className="course-chooser-sub">{course.net_m !== null ? `net ${elev(course.net_m, units, true)}` : 'no supplied profile'}</span>
                                {course.downhill_opening ? <span className="course-chooser-tag">Downhill opening</span> : null}</td>
                              <td>
                                {b.own ? <Link className="course-chooser-band" href={b.href}>Pace band<span className="sr-only"> for {goalText} in {course.city}</span></Link>
                                  : <><Link className="course-chooser-band" href={b.href}>Pace band<span className="sr-only"> for {goalText}, all courses: {b.why}</span></Link><span className="course-chooser-sub" aria-hidden="true">all courses</span></>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <ul className="course-chooser-cards">
                    {visible.map(({ row, course }) => {
                      const temps = tempRange(course.start_temp_c, units);
                      const b = band(course);
                      return (
                        <li key={course.slug} className="course-chooser-card">
                          <div className="course-chooser-card-head">
                            <h3>{courseLink(course.city)}</h3>
                            <p>{monthText(course.months)} · {count(row.n)} finishes · {plural(row.ed, 'edition')}</p>
                            {course.downhill_opening ? <span className="course-chooser-tag">Downhill opening</span> : null}
                          </div>
                          <dl className="course-chooser-key">
                            <div className={sort === 'under' ? 'is-sorted' : undefined}><dt>Under {goalText}</dt><dd>{pctText(row.under)}</dd></div>
                            <div className={sort === 'sd' ? 'is-sorted' : undefined}><dt>Sustained slowdown</dt><dd>{pctText(row.sd)}</dd></div>
                            <div className={sort === 'after20' ? 'is-sorted' : undefined}><dt>After {at20}</dt><dd>{formatMargin(row.after20)}</dd></div>
                          </dl>
                          <details className="course-chooser-more">
                            <summary>Finish times, weather and route<span className="sr-only"> for {course.city}</span></summary>
                            <FinishBar fin={row.fin} goalS={goalS} scale={scale} variant="card" city={course.city} goalLabel={goalText} />
                            <dl className="course-chooser-context">
                              <div><dt>Finish times</dt><dd>Median {formatDuration(row.fin[1], true)}<br />10th–90th percentile {formatDuration(row.fin[0], true)}–{formatDuration(row.fin[2], true)}</dd></div>
                              <div><dt>Race month</dt><dd>{monthText(course.months, true)}</dd></div>
                              <div><dt>Start temperature</dt><dd>{temps ? `${temps} across all course editions (${course.weather_editions} of ${count(course.editions)} with weather), not only this row’s` : 'No weather row'}</dd></div>
                              <div><dt>Route profile</dt><dd>{course.gain_m !== null && course.loss_m !== null ? `Climb ${elev(course.gain_m, units)}, descent ${elev(course.loss_m, units)}` : 'No supplied profile'}{course.net_m !== null ? `, net ${elev(course.net_m, units, true)}` : ''}</dd></div>
                              <div><dt>First 5 km</dt><dd>{course.downhill_opening ? `Downhill opening: drops more than ${units === 'mi' ? '82 ft' : '25 m'}` : `Not a downhill opening (drops less than ${units === 'mi' ? '82 ft' : '25 m'})`}</dd></div>
                            </dl>
                            {course.terrain_note ? <p className="course-chooser-card-note">{course.terrain_note} Weather and elevation are context only.</p> : null}
                          </details>
                          <div className="course-chooser-card-links">
                            {pageSet.has(course.slug) ? <Link href={`/courses/${course.slug}`}>Course page<span className="sr-only"> for {course.city}</span></Link> : null}
                            {b.own ? <Link href={b.href}>Pace band for {goalText}<span className="sr-only"> in {course.city}</span></Link>
                              : <Link href={b.href}>Pace band for {goalText}, all courses<span className="sr-only">: {b.why}</span></Link>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div className="tool-empty">
                  No published course at {goalText} matches these filters{month !== null ? ` (races in ${MONTHS_LONG[month - 1]})` : ''}.{' '}
                  <button type="button" className="button-secondary course-chooser-clear" onClick={() => setQ({ month: '', open: '' })}>Clear filters</button>
                </div>
              )}
            </EvidencePanel>
          </div>

          <EvidencePanel kind="data" title={`Not published at ${goalText}`}
            meta={`No substitute course is shown. A row needs ${minEditions} editions with at least ${minEditionFinishes} finishes at this pace and 100 finishes in all; groups smaller than that are never published.`}>
            <div className="course-chooser-unavail">
              <div>
                <h3>Not enough finishes at this pace</h3>
                {unavailable.pace.length ? (
                  <ul>{unavailable.pace.map((u) => <li key={u.city}><b>{courseLink(u.city)}</b> <span>{u.reason}</span></li>)}</ul>
                ) : <p className="course-chooser-none">Every course with {minEditions} or more editions has a row at {goalText}.</p>}
              </div>
              {unavailable.structural.length ? (
                <div>
                  <h3>Too few editions for any goal</h3>
                  <ul>{unavailable.structural.map((u) => <li key={u.city}><b>{courseLink(u.city)}</b> <span>{u.reason}</span></li>)}</ul>
                </div>
              ) : null}
            </div>
          </EvidencePanel>

          <div className="tool-callout no-print">
            <strong>Picked a course?</strong> Each row’s pace band link opens a printable <Link href={`/tools/pace-band?goal=${goalText}`}>pace band for {goalText}</Link> with what finishes that came in within five minutes under {goalText} on that course ran at each 5 km mat. Where a course had fewer than 100 such finishes, the link is marked “all courses” and opens the band for every course together. To compare race mornings at your pace, try the <Link href="/tools/weather-match">weather match</Link>.
          </div>
          <ShareBar />
        </>
      ) : null}
    </div>
  );
}
