'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, EvidencePanel, ExampleNote, ShareBar, Stat, Stepper } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight } from '@/lib/insights';
import { loadShard, type PaceBandGroup, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { MARATHON_KM, MATS_KM, perUnit, splitTable, watchTarget, type SplitInterval } from '@/lib/tools/pace';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { formatDuration, formatHM, parseDuration } from '@/lib/tools/time';
import { KM_PER_MILE, elevationLabel, type UnitSystem } from '@/lib/units';
import { SECTION_BOUNDS, count, sectionLabel } from '@/lib/viz/format';

/** Supplied route elevation (every `step` km) for the optional printed back strip. Context only. */
export interface RouteProfile { slug: string; city: string; race: string; km: number; step: number; m: number[]; min: number; max: number; gain: number; loss: number }
/** A course other Pace Notes data knows but the pace band does not publish, with the reason (built at export time). */
export interface UnpublishedCourse { city: string; note: string }

const INDEX_PATH = 'tools/pace-band.json';
const GOAL_MIN_S = 90 * 60;
const GOAL_MAX_S = 480 * 60;
const OBS_MIN = 150;
const OBS_MAX = 390;
const CHECKPOINTS = [...MATS_KM, MARATHON_KM];
const HELD = '#2F5BFF';
const SLOW = '#FF5B2E';
const PRESETS = [180, 210, 240, 270, 300];
/** The course chooser covers goals from 2:30 to 6:30 (minutes). */
const CHOOSER_MIN = 150;
const CHOOSER_MAX = 390;
/** Typing commits a readable goal after this pause, so a prefix such as "3:3" on the way to "3:35" is not taken as the goal. */
const COMMIT_MS = 400;
/** After this pause, an unreadable or out-of-range goal is flagged even before the field loses focus. */
const PAUSE_MS = 900;
const EMPTY_GOAL = 'Type a goal, such as 3:30.';
const DEFAULTS = { goal: '4:00', course: 'all', g: 'all', split: '', watch: '0', print: 'strip', back: '0' };

type Gender = 'all' | 'men' | 'women';
const GENDER_OPTIONS: { value: Gender; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }];
const ROW_OPTIONS: { value: SplitInterval; label: string }[] = [{ value: 'mi', label: '1 mi' }, { value: 'km', label: '1 km' }, { value: '5k', label: '5 km mats' }];
const WATCH_OPTIONS = [{ value: '0', label: 'Exact' }, { value: '0.5', label: '+0.5%' }, { value: '1', label: '+1%' }, { value: '1.5', label: '+1.5%' }];

interface Cell { n: number; ed: number; e50: number[]; s50: number[]; e25?: number[]; e75?: number[]; s25?: number[]; s75?: number[]; sd?: number; onset?: number[] }

function cellOf(group: PaceBandGroup | undefined, minute: number): Cell | null {
  if (!group) return null;
  const i = group.g.indexOf(minute);
  if (i < 0) return null;
  return {
    n: group.n[i], ed: group.ed[i], e50: group.e50[i], s50: group.s50[i],
    e25: group.e25?.[i], e75: group.e75?.[i], s25: group.s25?.[i], s75: group.s75?.[i], sd: group.sd?.[i], onset: group.onset?.[i],
  };
}

const clampGoal = (s: number) => Math.min(GOAL_MAX_S, Math.max(GOAL_MIN_S, s));
const fmtGoal = (s: number) => (Math.round(s) % 60 === 0 ? formatHM(s) : formatDuration(s, true));
const fmtPace = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;
const editions = (k: number) => (k === 1 ? 'one edition' : `${count(k)} editions`);
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const miles = (km: number) => `${(km / KM_PER_MILE).toFixed(1)} mi`;

/** "5 km" with the mile equivalent; source checkpoints stay metric. */
function MatName({ km, units }: { km: number; units: UnitSystem }) {
  const finish = km >= 42.19;
  return (
    <>
      {finish ? 'Finish' : `${km} km`}
      <span className="pace-band-sub">{finish ? (units === 'mi' ? '26.2 mi' : '42.2 km') : units === 'mi' ? miles(km) : ' '}</span>
    </>
  );
}

type Observed =
  | { state: 'off'; message: string; retry: boolean }
  | { state: 'loading' }
  | { state: 'unavailable'; title: string; message: string; range: string | null }
  | { state: 'ok'; minute: number; all: Cell; held: Cell | null; slow: Cell | null; lo: number; hi: number; where: string; place: string; genderWord: string };
type ObservedOk = Extract<Observed, { state: 'ok' }>;

/** True once the viewport matches `query` (false during server render and the first client render). */
function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export default function PaceBand({ indexSha, profiles, screened, projectorScopes, unpublished }: {
  indexSha: string | null; profiles: RouteProfile[]; screened: string | null; projectorScopes: string[] | null; unpublished: Record<string, UnpublishedCourse>;
}) {
  const { units } = useUnits();
  const [q, setQuery, ready, fromUrl] = useQueryState(DEFAULTS);
  // What the visitor has changed on this page: anything (hides the example note) and the goal (kept in the URL even at 4:00).
  const [changed, setChanged] = useState({ any: false, goal: false });
  const setQ = (patch: Partial<typeof DEFAULTS>) => { setChanged((c) => ({ any: true, goal: c.goal || 'goal' in patch })); setQuery(patch); };
  // The goal field's own problem (unreadable, out of range or empty) once it shows; the results then hold the last good goal.
  const [fieldProblem, setFieldProblem] = useState<string | null>(null);
  // The band sits beside the observed panels from 1100 px; the DOM order follows the visual order at each width.
  const wide = useMedia('(min-width: 1100px)');

  const parsed = parseDuration(q.goal, 'race');
  const goal = parsed !== null && parsed >= GOAL_MIN_S && parsed <= GOAL_MAX_S ? Math.round(parsed) : null;
  const course = q.course || 'all';
  const gender: Gender = q.g === 'men' || q.g === 'women' ? q.g : 'all';
  const interval: SplitInterval = q.split === 'mi' || q.split === 'km' || q.split === '5k' ? q.split : units === 'mi' ? 'mi' : 'km';
  const overrun = [0, 0.5, 1, 1.5].includes(Number(q.watch)) ? Number(q.watch) / 100 : 0;
  const printMode = q.print === 'page' ? 'page' : 'strip';
  const setGoal = (s: number | null) => setQ({ goal: s === null ? '' : fmtGoal(clampGoal(s)) });
  // ±1 minute, snapping in the direction of travel when the goal has seconds (3:30:30 → 3:31 or 3:30).
  const step = (delta: number) => {
    if (goal === null) { setGoal(14400 + delta); return; }
    const m = goal / 60;
    setGoal((delta > 0 ? Math.floor(m) + delta / 60 : Math.ceil(m) + delta / 60) * 60);
  };

  // A shared link always carries the units it was viewed in, so the recipient sees the same band (rows follow the units).
  // A goal from a link or from the visitor stays in the URL even when it is 4:00 (useQueryState drops defaults), so a
  // reload or a shared link does not present it as the example.
  const goalExplicit = fromUrl.has('goal') || changed.goal;
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    let dirty = false;
    if (url.searchParams.get('units') !== units) { url.searchParams.set('units', units); dirty = true; }
    if (goalExplicit && !url.searchParams.has('goal')) { url.searchParams.set('goal', q.goal); dirty = true; }
    if (!dirty) return;
    const search = url.searchParams.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',');
    window.history.replaceState(window.history.state, '', `${url.pathname}?${search}${url.hash}`);
  }, [ready, units, q, goalExplicit]);

  // Verified index, then one verified shard per course × recorded gender. `retry` re-runs both loads.
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState<PaceBandIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  useEffect(() => {
    if (!indexSha) return;
    let live = true;
    loadInsight<PaceBandIndex>(INDEX_PATH, indexSha).then((d) => { if (live) { setIndex(d); setIndexError(false); } }, () => { if (live) setIndexError(true); });
    return () => { live = false; };
  }, [indexSha, retry]);
  const shardPath = `tools/pace-band/${course}/${gender}.json`;
  const [shard, setShard] = useState<{ path: string; data: PaceBandShard | null } | null>(null);
  useEffect(() => {
    if (!index || !index.shards?.[shardPath]) return;
    let live = true;
    loadShard<PaceBandShard>(index, shardPath).then((d) => { if (live) setShard({ path: shardPath, data: d }); }, () => { if (live) setShard({ path: shardPath, data: null }); });
    return () => { live = false; };
  }, [index, shardPath, retry]);
  const tryAgain = () => { setIndexError(false); setShard(null); setRetry((r) => r + 1); };

  const scope = index?.scopes.find((s) => s.slug === course) ?? null;
  // A course other data knows (Melbourne, say) but the pace band does not publish: named, with the reason.
  const known = course !== 'all' && !scope && Object.prototype.hasOwnProperty.call(unpublished, course) ? unpublished[course] : null;
  // Never echo an unknown slug from the URL into the copy.
  const city = scope?.city ?? known?.city ?? null;
  const place = course === 'all' ? 'All courses' : city ?? 'this course';
  const where = course === 'all' ? 'on all courses' : city ? `in ${city}` : 'on this course';
  const genderWord = gender === 'all' ? '' : gender === 'men' ? 'men' : 'women';
  // Observed windows use whole minutes. A goal with seconds uses the minute at or below it, so every finish in the window beat the goal.
  const minute = goal === null ? null : Math.floor(goal / 60);

  const observed: Observed = useMemo(() => {
    if (!indexSha) return { state: 'off', message: 'The observed data is not available in this build. The even-pace band still works.', retry: false };
    if (indexError) return { state: 'off', message: 'The observed data could not be loaded or verified. The even-pace band still works.', retry: true };
    if (!index) return { state: 'loading' };
    if (!scope) {
      return known ? { state: 'unavailable', title: `Not published for ${known.city}.`, message: known.note, range: null }
        : { state: 'unavailable', title: 'Course not found.', message: 'This link names a course that is not in the data.', range: null };
    }
    const meta = scope.genders[gender];
    if (!meta || !index.shards?.[shardPath]) {
      return { state: 'unavailable', title: 'Not published for this selection.', message: `No goal ${where} has 100 finishes recorded as ${genderWord || 'any gender'} in its window, so nothing is published for this selection.`, range: null };
    }
    const range = `Published goals ${where}${genderWord ? ` for ${genderWord}` : ''}: ${formatHM(meta.goals[0] * 60)} to ${formatHM(meta.goals[1] * 60)}${meta.count < meta.goals[1] - meta.goals[0] + 1 ? ', with gaps' : ''}.`;
    if (minute === null) return { state: 'unavailable', title: 'No goal yet.', message: 'Type a goal to see what finishes at that time ran.', range: null };
    if (minute < OBS_MIN || minute > OBS_MAX) return { state: 'unavailable', title: 'Outside the observed range.', message: `Observed groups cover whole-minute goals from ${formatHM(OBS_MIN * 60)} to ${formatHM(OBS_MAX * 60)}. The even-pace band works for any goal from 1:30 to 8:00.`, range: null };
    if (!shard || shard.path !== shardPath) return { state: 'loading' };
    if (!shard.data) return { state: 'off', message: 'This selection could not be loaded or verified. Try again, or choose another course.', retry: true };
    const all = cellOf(shard.data.groups.all, minute);
    const windowS = shard.data.window_s || 300;
    const lo = minute * 60 - windowS;
    const hi = minute * 60 - 1;
    if (!all) return { state: 'unavailable', title: 'Not published for this goal.', message: `Fewer than 100 finishes ran ${formatDuration(lo, true)} to ${formatDuration(hi, true)} ${where}${genderWord ? ` (recorded as ${genderWord})` : ''}, so this goal is not published.`, range };
    return { state: 'ok', minute, all, held: cellOf(shard.data.groups.held, minute), slow: cellOf(shard.data.groups.slowdown, minute), lo, hi, where, place, genderWord };
  }, [indexSha, indexError, index, scope, known, gender, shardPath, where, place, genderWord, minute, shard]);

  // While a new shard loads, keep the last result for the same minute on screen (dimmed, aria-busy) instead of collapsing the page.
  const [settled, setSettled] = useState<Observed | null>(null);
  useEffect(() => { if (observed.state !== 'loading') setSettled(observed); }, [observed]);
  const stale = observed.state === 'loading' && settled?.state === 'ok' && settled.minute === minute ? settled : null;
  const shown: Observed = stale ?? observed;
  const ok: ObservedOk | null = shown.state === 'ok' ? shown : null;
  const fresh: ObservedOk | null = observed.state === 'ok' ? observed : null;

  const pKm = goal === null ? null : goal / MARATHON_KM;
  const rows = useMemo(() => (goal === null ? [] : splitTable(goal, MARATHON_KM, interval)), [goal, interval]);
  const profile = profiles.find((p) => p.slug === course) ?? null;
  const showBack = q.back === '1' && profile !== null;
  // Results from untouched example inputs: nothing in the link, nothing changed yet.
  const isExample = ready && fromUrl.size === 0 && !changed.any;
  // The field holds text that is not a goal while the results still show the last good one.
  const held = fieldProblem !== null && goal !== null;
  const busy = Boolean(stale) || held;
  const gap20 = ok && ok.held && ok.slow ? ok.held.e50[3] - ok.slow.e50[3] : null;

  // One always-mounted, visually hidden status line: a short summary, debounced while typing. The first settled result is not announced.
  const [notice, setNotice] = useState('');
  const freshGap = fresh && fresh.held && fresh.slow ? fresh.held.e50[3] - fresh.slow.e50[3] : null;
  const summary = goal === null || pKm === null ? 'No band yet. Type a goal from 1:30 to 8:00.' : observed.state === 'loading' ? null : [
    notice,
    held ? `${fieldProblem} The results below still show ${fmtGoal(goal)}.` : '',
    `${fmtGoal(goal)} goal: even pace ${fmtPace(pKm, units)}, arithmetic.`,
    fresh && freshGap !== null ? `Pace Notes data: at the 20 km mat, finishes with a sustained slowdown were a median ${formatDuration(Math.abs(freshGap))} ${freshGap >= 0 ? 'earlier' : 'later'} than those that held pace.` : '',
    fresh && fresh.all.sd !== undefined ? `${pct(fresh.all.sd)} of ${count(fresh.all.n)} finishes in the window had a sustained slowdown.` : '',
    observed.state === 'unavailable' ? `Observed finishes: ${observed.title}` : '',
    observed.state === 'off' ? `Observed finishes: ${observed.message}` : '',
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
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Switching the observed columns to a wider group: say so, and move focus to the panel heading (the button unmounts).
  const [moveFocus, setMoveFocus] = useState(0);
  useEffect(() => {
    if (!moveFocus) return;
    const h = document.querySelector<HTMLElement>('#pace-band-observed .tool-panel-title');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }, [moveFocus]);
  const widen = (patch: { course?: string; g?: string }, message: string) => { setQ(patch); setNotice(message); setMoveFocus((n) => n + 1); };

  const printAs = (mode: 'strip' | 'page') => {
    setQuery({ print: mode });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const fallbacks = (
    <div className="pace-band-actions">
      {course !== 'all' ? <button type="button" className="button-secondary" onClick={() => widen({ course: 'all' }, 'Showing All courses in the observed columns.')}>Switch to All courses</button> : null}
      {gender !== 'all' ? <button type="button" className="button-secondary" onClick={() => widen({ g: 'all' }, 'Showing all genders in the observed columns.')}>Switch to all genders</button> : null}
    </div>
  );
  const badGoal = q.goal.trim().slice(0, 24);

  // Cross-tool links. The course chooser gets the whole minute at or below the goal, only inside its 2:30–6:30 range.
  const chooserGoal = minute !== null && minute >= CHOOSER_MIN && minute <= CHOOSER_MAX ? minute : null;
  // The projector gets the exact goal, the course only when it publishes it, and t=none so it waits for a tracker time
  // instead of showing its example runner. Its recorded-gender groups exist for All courses only.
  const projectorCourse = course !== 'all' && projectorScopes?.includes(course) ? course : 'all';
  const projector = {
    href: `/tools/projector?target=${goal === null ? '' : formatDuration(goal, true)}&t=none${projectorCourse !== 'all' ? `&course=${projectorCourse}` : ''}${projectorCourse === 'all' && gender !== 'all' ? `&v=${gender}` : ''}`,
    label: projectorCourse !== 'all' ? ` for ${place}` : '',
    note: course !== 'all' && projectorCourse === 'all' && projectorScopes !== null
      ? ` (all courses${gender !== 'all' ? `, recorded as ${genderWord}` : ''}: ${city ? `${city} is` : 'this course is'} not in it)`
      : projectorCourse !== 'all' && gender !== 'all' ? ' (all recorded genders: its gender groups cover All courses only)'
        : gender !== 'all' ? ` (finishes recorded as ${genderWord})` : '',
  };

  let layout: ReactNode = null;
  if (goal !== null && pKm !== null) {
    const bandPanel = (
      <EvidencePanel key="band" kind="arithmetic" title="Your even-pace band" id="pace-band-band"
        meta={`${fmtGoal(goal)} at an even ${fmtPace(pKm, units)}. Elapsed time at each marker; timing mats highlighted.`}>
        <div className="pace-band-controls no-print">
          <div className="tool-field">
            <span className="tool-label" id="pace-band-rows">Rows</span>
            <div role="group" aria-labelledby="pace-band-rows"><Choice label="Band rows" small value={interval} onChange={(v) => setQ({ split: v })} options={ROW_OPTIONS} /></div>
          </div>
          <div className="tool-field">
            <span className="tool-label" id="pace-band-watch">If my watch reads long</span>
            <div role="group" aria-labelledby="pace-band-watch"><Choice label="Watch reads the course long by" small value={String(overrun * 100)} onChange={(v) => setQ({ watch: v })} options={WATCH_OPTIONS} /></div>
          </div>
        </div>
        <Wristband rows={rows} goal={goal} pKm={pKm} units={units} overrun={overrun} />
        {overrun ? (
          <p className="tool-note">If your watch reads the course {pct(overrun, 1)} long, it shows about <strong>{fmtPace(watchTarget(pKm, overrun), units)}</strong> while you are exactly on {fmtPace(pKm, units)}, and reads {((MARATHON_KM * (1 + overrun)) / (units === 'mi' ? KM_PER_MILE : 1)).toFixed(2)} {units} at the finish. The band’s times are for the course markers, not watch laps.</p>
        ) : (
          <p className="tool-note no-print">Most watches read a certified course a little long, so their pace runs quick. Pick an overrun above to see the watch pace that matches this band.</p>
        )}
      </EvidencePanel>
    );
    const observedPanel = (
      <EvidencePanel key="observed" kind="data" id="pace-band-observed"
        title={ok ? <>Finishes that ran {formatDuration(ok.lo, true)} to {formatDuration(ok.hi, true)} {ok.where}</> : <>What finishes at {fmtGoal(goal)} ran {where}</>}
        meta={ok ? <>Achieved finishes, not stated goals{ok.genderWord ? `, recorded as ${ok.genderWord}` : ''}: every one beat {formatHM(ok.minute * 60)} by 0:01 to 5:00. Observed, not a recommended plan.{goal % 60 ? ` Your goal has seconds, so the window uses the whole minute below it, ${formatHM(ok.minute * 60)}.` : ''}</> : undefined}>
        {stale ? <p className="tool-state pace-band-busy">Loading {place}{genderWord ? `, ${genderWord}` : ''}… The dimmed figures are the previous selection.</p> : null}
        {observed.state === 'loading' && !stale ? <p className="tool-state">Loading the observed finishes…</p> : null}
        {shown.state === 'off' ? (
          <div className="tool-state is-error pace-band-error">
            <p>{shown.message}</p>
            {shown.retry ? <button type="button" className="button-secondary" onClick={tryAgain}>Try again</button> : null}
          </div>
        ) : null}
        {shown.state === 'unavailable' ? (
          <div className="pace-band-unavailable">
            <p><strong>{shown.title}</strong> {shown.message}</p>
            {shown.range ? <p>{shown.range}</p> : null}
            {course !== 'all' || gender !== 'all' ? <p>You can switch the observed columns to a wider group; the band itself does not change.</p> : null}
            {fallbacks}
          </div>
        ) : null}
        {ok ? <div className={stale ? 'pace-band-dim' : undefined}><ObservedTable cells={ok} goal={goal} units={units} onFallback={fallbacks} /></div> : null}
      </EvidencePanel>
    );
    const chartPanel = ok && (ok.held || ok.slow) ? (
      <EvidencePanel key="chart" kind="data" id="pace-band-chart"
        title={ok.held && ok.slow ? 'Section pace: held pace vs sustained slowdown' : ok.held ? 'Section pace: held pace' : 'Section pace: sustained slowdown'}
        meta={`Median pace in each section with the middle half of finishes (25th–75th percentile) shaded, against even pace for ${fmtGoal(goal)}. The shading is observed variation between finishes, not uncertainty.${!ok.slow ? ' The sustained slowdown group has fewer than 100 finishes in this window, so it is not drawn.' : !ok.held ? ' The held-pace group has fewer than 100 finishes in this window, so it is not drawn.' : ''}`}>
        <div className={stale ? 'pace-band-dim' : undefined}><SectionChart held={ok.held} slow={ok.slow} pKm={pKm} units={units} /></div>
      </EvidencePanel>
    ) : null;
    const onsetPanel = ok && ok.all.onset && ok.slow ? <OnsetPanel key="onset" all={ok.all} slow={ok.slow} units={units} where={ok.where} dim={Boolean(stale)} /> : null;
    layout = (
      <div className={`pace-band-layout${held ? ' pace-band-held-dim' : ''}`} aria-busy={busy || undefined}>
        {wide ? [bandPanel, observedPanel, chartPanel, onsetPanel] : [observedPanel, chartPanel, bandPanel, onsetPanel]}
      </div>
    );
  }

  return (
    <div className="pace-band-root" data-print={printMode}>
      <p className="sr-only" role="status">{status}</p>
      <div className="tool-workspace">
        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Pace band inputs">
          <h2>Your race</h2>
          {isExample ? <ExampleNote>A 4:00 goal on all courses. Type your goal; the band and the observed columns update as you type.</ExampleNote> : null}
          <GoalField seconds={goal} raw={q.goal} onChange={setGoal} onStep={step} onProblem={setFieldProblem}
            onEdit={() => setChanged((c) => (c.any ? c : { ...c, any: true }))} />
          <div className="tool-presets" role="group" aria-label="Common goals">
            {PRESETS.map((m) => <button key={m} type="button" aria-pressed={goal === m * 60} onClick={() => setGoal(m * 60)}>{formatHM(m * 60)}</button>)}
          </div>
          <div className="tool-field">
            <label htmlFor="pace-band-course">Course</label>
            <select id="pace-band-course" value={course} onChange={(e) => setQ({ course: e.target.value })}>
              <option value="all">All courses{index ? ` · ${editions(index.scopes.find((s) => s.slug === 'all')?.editions ?? 0)}` : ''}</option>
              {index ? (
                <>
                  {!scope && course !== 'all' ? <option value={course} disabled>{known ? `${known.city} · not published` : 'Unknown course'}</option> : null}
                  {index.scopes.filter((s) => s.slug !== 'all').map((s) => <option key={s.slug} value={s.slug}>{s.city ?? s.slug} · {editions(s.editions)}</option>)}
                </>
              ) : course !== 'all' ? <option value={course}>{profile?.city ?? known?.city ?? 'Loading courses…'}</option> : null}
            </select>
          </div>
          <div className="tool-field">
            <span className="tool-label" id="pace-band-gender">Recorded gender <span className="pace-band-optional">optional</span></span>
            <div role="group" aria-labelledby="pace-band-gender"><Choice label="Recorded gender" value={gender} onChange={(v) => setQ({ g: v })} options={GENDER_OPTIONS} small /></div>
          </div>
          <p className="tool-field-hint">The band is arithmetic for any goal. The observed columns use the course and recorded gender you choose; nothing about you leaves this page.</p>
        </form>

        <div className="tool-results">
          {goal === null || pKm === null ? (
            <p className="tool-empty">
              {badGoal ? <>The goal in this link, “{badGoal}”, is not a marathon time from 1:30 to 8:00. </> : null}
              Type a goal between 1:30 and 8:00 (for example 3:30) to build your band.
            </p>
          ) : (
            <>
              {held ? (
                <p className="tool-state pace-band-held">
                  Showing <b>{fmtGoal(goal)}</b>. {fieldProblem === EMPTY_GOAL ? 'Type a goal above to update the band.' : 'Fix the goal above to update the band; nothing below follows it until then.'}
                </p>
              ) : null}
              <div className={`tool-headline pace-band-headline${held ? ' pace-band-held-dim' : ''}`} aria-busy={busy || undefined}>
                <div className="tool-badges pace-band-headline-badges">
                  <span className="evidence-badge evidence-arithmetic">Arithmetic</span>
                  {ok ? <span className="evidence-badge evidence-data">Pace Notes data</span> : null}
                </div>
                <Stat label="Even pace" value={formatDuration(perUnit(pKm, units))}
                  sub={`Arithmetic · per ${units === 'mi' ? 'mile' : 'km'} · ${fmtPace(pKm, units === 'mi' ? 'km' : 'mi')}${overrun ? ` · watch ${fmtPace(watchTarget(pKm, overrun), units)}` : ''}`} />
                {gap20 !== null && ok ? (
                  <Stat label="20 km gap" value={formatDuration(Math.abs(gap20))}
                    sub={`Pace Notes data · median at the 20 km mat: sustained slowdown ${gap20 >= 0 ? 'earlier' : 'later'} than held pace`} />
                ) : (
                  <Stat label="At 20 km" value={formatDuration(pKm * 20)} sub={`Arithmetic · even pace${units === 'mi' ? ` · ${miles(20)}` : ''}`} />
                )}
                {ok && ok.all.sd !== undefined ? (
                  <Stat label="Sustained slowdown" value={pct(ok.all.sd)} sub={`Pace Notes data · observed share of ${count(ok.all.n)} complete finishes in the window`} />
                ) : (
                  <Stat label="Finish" value={formatDuration(goal, true)} sub="Arithmetic · even-pace goal" />
                )}
                {gap20 !== null && ok && ok.held && ok.slow ? (
                  <p className="pace-band-headline-note">
                    <span className="pace-band-src is-data">Pace Notes data</span>{' '}
                    Same finish window ({formatDuration(ok.lo, true)}–{formatDuration(ok.hi, true)}, {ok.where}), different races: finishes that later had a sustained slowdown passed
                    the 20 km mat in a median <b>{formatDuration(ok.slow.e50[3])}</b>, {formatDuration(Math.abs(gap20))} {gap20 >= 0 ? 'earlier' : 'later'} than those that held pace (<b>{formatDuration(ok.held.e50[3])}</b>).{' '}
                    <span className="pace-band-src">Arithmetic</span>{' '}
                    Even pace for {fmtGoal(goal)} reaches 20 km in <b>{formatDuration(pKm * 20)}</b>.
                  </p>
                ) : null}
              </div>

              {layout}

              <PrintPanel goal={goal} pKm={pKm} units={units} rows={rows} interval={interval} overrun={overrun} place={place} genderWord={genderWord}
                observed={fresh} profile={profile} showBack={showBack} onBack={(v) => setQ({ back: v ? '1' : '0' })} onPrint={printAs} waiting={held} />

              <div className="print-only pace-band-print-notes">
                <p>Pace Notes pace band. The band is even-pace arithmetic. Observed columns are achieved finishes from Pace Notes data (complete finishes only; counts are finishes, not people), grouped by whether they had a sustained slowdown. {SLOWDOWN_DEFINITION} Source: {SLOWDOWN_CITATION.label}. Descriptive, not a plan, and not a cause.</p>
                <p>Course groups pool editions with different weather, fields and years{fresh ? ` (${editions(fresh.all.ed)} in this window)` : ''}. Percentiles are observed variation between finishes, not uncertainty. Runners who stopped are not in the data. No weather or elevation figure enters any calculation{showBack ? '; the elevation strip is the supplied current route, context only' : ''}.</p>
                {screened ? <p>Screened editions. {screened}</p> : null}
              </div>

              {/* Links and the copied link carry the goal on screen, so they wait while the field holds something else. */}
              {held ? null : (
                <>
                  <div className="tool-callout no-print">
                    <strong>Keep going.</strong> See the just-made vs just-missed contrast in <Link href="/analyses/where-time-is-gained">where time is gained</Link>, how openings play out in <Link href="/analyses/starting-pace">starting pace</Link>,{' '}
                    {chooserGoal !== null ? <>{formatHM(chooserGoal * 60)} on other courses in the <Link href={`/tools/course-chooser?goal=${formatHM(chooserGoal * 60)}`}>course chooser</Link></>
                      : <>other courses in the <Link href="/tools/course-chooser">course chooser</Link> (it covers goals from 2:30 to 6:30)</>},
                    and live finish ranges for {fmtGoal(goal)} on race day with the <Link href={projector.href}>race-day projector{projector.label}</Link>{projector.note}.
                  </div>
                  <ShareBar print={false} />
                </>
              )}

              <div className="pace-band-goalbar no-print">
                <Stepper label="Goal" onStep={step}>
                  <span className="pace-band-goalbar-value"><b>{fmtGoal(goal)}</b><span>{fmtPace(pKm, units)}</span></span>
                </Stepper>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Goal input in h:mm with −/+ one-minute steppers. Keeps the visitor's text while they type. A readable goal from 1:30
 * to 8:00 is committed after a short pause, on Enter or when the field loses focus, so a prefix on the way to a longer
 * entry ("99" before "99:99", "3:3" before "3:3x") is never taken as the goal. An emptied field is committed on blur.
 * Unreadable or out-of-range text is flagged (after blur or a pause) and reported upward, so the results can say they
 * still show the last good goal.
 */
function GoalField({ seconds, raw, onChange, onStep, onEdit, onProblem }: {
  seconds: number | null; raw: string; onChange: (s: number | null) => void; onStep: (delta: number) => void;
  onEdit: () => void; onProblem: (problem: string | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(seconds === null ? raw : fmtGoal(seconds));
  const [touched, setTouched] = useState(seconds === null && raw.trim() !== '');
  const [paused, setPaused] = useState(false);
  const last = useRef(seconds);
  // The goal when this edit began: unreadable text left on blur goes back to it, so a paused-on prefix ("99" on the way
  // to "99:99" is 1:39) never stays as the goal.
  const before = useRef(seconds);
  const commitTimer = useRef<number | undefined>(undefined);
  const pauseTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => { window.clearTimeout(commitTimer.current); window.clearTimeout(pauseTimer.current); }, []);
  useEffect(() => {
    if (seconds !== last.current) {
      last.current = seconds;
      window.clearTimeout(commitTimer.current);
      // The field never commits unreadable text, so a null here came from the link: show what it said (flagged unless empty).
      if (seconds === null) { setText(raw); setTouched(raw.trim() !== ''); return; }
      const typed = parseDuration(text, 'race');
      if (typed === null || Math.round(typed) !== seconds) setText(fmtGoal(seconds));
    }
  }, [seconds, text, raw]);
  const readGoal = (value: string) => {
    const p = value.trim() ? parseDuration(value, 'race') : null;
    return p !== null && p >= GOAL_MIN_S && p <= GOAL_MAX_S ? Math.round(p) : null;
  };
  const send = (s: number | null) => { if (s !== last.current) { last.current = s; onChange(s); } };
  // Blur and Enter: commit a readable goal now (and tidy its text), or an emptied field. Anything else stays flagged in
  // the field, and on blur the results go back to the goal from before the edit.
  const commitNow = (value: string, leaving: boolean) => {
    window.clearTimeout(commitTimer.current);
    if (!value.trim()) { send(null); return; }
    const s = readGoal(value);
    if (s !== null) { setText(fmtGoal(s)); send(s); before.current = s; } else if (leaving && before.current !== null) send(before.current);
  };
  const parsed = text.trim() ? parseDuration(text, 'race') : null;
  const problem = !text.trim() ? EMPTY_GOAL : parsed === null ? 'Try 3:30, 3:30:00 or 210 (minutes).'
    : parsed < GOAL_MIN_S || parsed > GOAL_MAX_S ? 'Goals from 1:30 to 8:00.' : null;
  const show = problem !== null && (touched || paused);
  useEffect(() => { onProblem(show ? problem : null); }, [show, problem, onProblem]);
  return (
    <div className="tool-field is-large pace-band-goal">
      <label htmlFor={id}>Goal finish time</label>
      <Stepper label="Goal" onStep={onStep}>
        <input id={id} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="4:00" value={text} enterKeyHint="done"
          aria-invalid={show || undefined} aria-describedby={`${id}-hint`}
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            onEdit();
            setPaused(false);
            window.clearTimeout(pauseTimer.current);
            pauseTimer.current = window.setTimeout(() => setPaused(true), PAUSE_MS);
            window.clearTimeout(commitTimer.current);
            const s = readGoal(value);
            if (s !== null) commitTimer.current = window.setTimeout(() => send(s), COMMIT_MS);
          }}
          onFocus={() => { before.current = last.current; }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitNow(text, false); } }}
          onBlur={() => { setTouched(true); commitNow(text, true); }} />
      </Stepper>
      <p className={`tool-field-hint${show ? ' is-error' : ''}`} id={`${id}-hint`}>{show ? problem : 'h:mm, or h:mm:ss. Observed groups use whole minutes from 2:30 to 6:30.'}</p>
    </div>
  );
}

/** The on-screen band: a dark strip with every marker's even-pace elapsed time. Arithmetic only. */
function Wristband({ rows, goal, pKm, units, overrun }: { rows: ReturnType<typeof splitTable>; goal: number; pKm: number; units: UnitSystem; overrun: number }) {
  return (
    <div className="pace-band-wrist">
      <div className="pace-band-wrist-head">
        <span><b>{fmtGoal(goal)}</b> goal</span>
        <span>{fmtPace(pKm, units)}{overrun ? <em> · watch {fmtPace(watchTarget(pKm, overrun), units)}</em> : null}</span>
      </div>
      <table>
        <caption className="sr-only">Even-pace elapsed times for {fmtGoal(goal)} (arithmetic)</caption>
        <thead><tr><th scope="col">Marker</th><th scope="col">Elapsed</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const kind = r.finish ? 'is-finish' : r.mat ? 'is-mat' : r.halfway ? 'is-half' : '';
            const label = r.finish ? 'Finish' : r.halfway ? `Half · ${units === 'mi' ? '13.1 mi' : '21.1 km'}` : r.mat ? (units === 'mi' ? `${r.km} km · ${miles(r.km)}` : `${r.km} km mat`)
              : Math.abs(r.km / KM_PER_MILE - Math.round(r.km / KM_PER_MILE)) < 1e-6 ? `${Math.round(r.km / KM_PER_MILE)} mi` : `${Math.round(r.km)} km`;
            return (
              <tr key={r.km} className={kind || undefined}>
                <th scope="row">{label}</th>
                <td>{formatDuration(r.elapsed)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Mat-by-mat table of the observed groups. */
function ObservedTable({ cells, goal, units, onFallback }: { cells: ObservedOk; goal: number; units: UnitSystem; onFallback: ReactNode }) {
  const [view, setView] = useState<'split' | 'all'>('split');
  const { all, held, slow } = cells;
  const missing = [!held ? 'held pace' : null, !slow ? 'sustained slowdown' : null].filter(Boolean);
  const single = all.ed === 1 ? ' One edition: every finish here comes from a single race.' : '';
  return (
    <>
      <div className="pace-band-view no-print">
        <Choice label="Groups to show" small value={view} onChange={setView}
          options={[{ value: 'split', label: 'Held vs slowdown' }, { value: 'all', label: 'All finishes' }]} />
      </div>
      <div className="tool-table-wrap">
        {view === 'split' ? (
          <table className="tool-table pace-band-table">
            <thead>
              <tr>
                <th scope="col">Mat</th>
                <th scope="col"><i className="pace-band-key" style={{ background: HELD }} aria-hidden="true" />Held pace</th>
                <th scope="col"><i className="pace-band-key" style={{ background: SLOW }} aria-hidden="true" />Sustained slowdown</th>
              </tr>
            </thead>
            <tbody>
              {CHECKPOINTS.map((km, i) => (
                <tr key={km} className={i === 8 ? 'is-finish' : i === 3 ? 'is-key' : undefined}>
                  <th scope="row"><MatName km={km} units={units} /></th>
                  <td>{held ? formatDuration(held.e50[i]) : '—'}</td>
                  <td>{slow ? formatDuration(slow.e50[i]) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">Finishes</th><td>{held ? count(held.n) : '—'}</td><td>{slow ? count(slow.n) : '—'}</td></tr>
              <tr><th scope="row">Editions</th><td>{held ? count(held.ed) : '—'}</td><td>{slow ? count(slow.ed) : '—'}</td></tr>
            </tfoot>
            <caption className="sr-only">Median elapsed time of the held-pace and sustained-slowdown groups at the official mats (Pace Notes data)</caption>
          </table>
        ) : (
          <table className="tool-table pace-band-table">
            <thead><tr><th scope="col">Mat</th><th scope="col">25th pct</th><th scope="col">Median</th><th scope="col">75th pct</th></tr></thead>
            <tbody>
              {CHECKPOINTS.map((km, i) => (
                <tr key={km} className={i === 8 ? 'is-finish' : i === 3 ? 'is-key' : undefined}>
                  <th scope="row"><MatName km={km} units={units} /></th>
                  <td>{all.e25 ? formatDuration(all.e25[i]) : '—'}</td>
                  <td>{formatDuration(all.e50[i])}</td>
                  <td>{all.e75 ? formatDuration(all.e75[i]) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">Finishes</th><td /><td>{count(all.n)}</td><td /></tr>
              <tr><th scope="row">Editions</th><td /><td>{count(all.ed)}</td><td /></tr>
            </tfoot>
            <caption className="sr-only">25th percentile, median and 75th percentile elapsed time of all finishes in the window at the official mats</caption>
          </table>
        )}
      </div>
      {view === 'split' ? (
        <p className="pace-band-caption">
          Median elapsed time of each group at the official mats (20 km is the 20 km mat, not halfway). Every finish here beat {formatHM(cells.minute * 60)}{goal % 60 ? ` and therefore ${fmtGoal(goal)}` : ''}. The even-pace times for {fmtGoal(goal)} are on the band (arithmetic).
          {missing.length ? ` Fewer than 100 finishes in the ${missing.join(' and ')} group, so it is not shown.` : ''}{single}
        </p>
      ) : (
        <p className="pace-band-caption">All finishes in the window, held and slowed together. A quarter passed each mat sooner than the 25th percentile and a quarter later than the 75th: observed spread, not uncertainty.{single}</p>
      )}
      {missing.length && view === 'split' ? <div className="no-print">{onFallback}</div> : null}
    </>
  );
}

/** Median section pace with interquartile bands for the held and slowdown groups, against even pace. Hand-built SVG. */
function SectionChart({ held, slow, pKm, units }: { held: Cell | null; slow: Cell | null; pKm: number; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 520);
  const [hover, setHover] = useState<number | null>(null);
  // Touch pointers fire pointerleave right after pointerup, so a tap's tooltip stays until the next tap outside the chart.
  useEffect(() => {
    if (hover === null) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setHover(null); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [hover]);
  const narrow = width < 460;
  const H = narrow ? 290 : 320;
  const m = { l: 46, r: 12, t: 30, b: 34 };
  const toU = (s: number) => perUnit(s, units);
  const series = [
    held ? { key: 'held', name: 'Held pace', colour: HELD, c: held } : null,
    slow ? { key: 'slow', name: 'Sustained slowdown', colour: SLOW, c: slow } : null,
  ].filter((s): s is { key: string; name: string; colour: string; c: Cell } => s !== null);
  const values = [toU(pKm), ...series.flatMap((s) => [...(s.c.s25 ?? s.c.s50), ...(s.c.s75 ?? s.c.s50)].map(toU))];
  const span = Math.max(...values) - Math.min(...values);
  const tick = [10, 15, 20, 30, 60, 120].find((t) => span / t <= 5) ?? 120;
  const lo = Math.floor(Math.min(...values) / tick) * tick;
  const hi = Math.ceil(Math.max(...values) / tick) * tick;
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (km: number) => m.l + (km / MARATHON_KM) * iw;
  const y = (v: number) => m.t + ((v - lo) / (hi - lo || 1)) * ih; // faster (smaller) paces at the top
  const mids = SECTION_BOUNDS.map(([a, b]) => (a + b) / 2);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(mids[i]).toFixed(1)} ${y(toU(v)).toFixed(1)}`).join(' ');
  const area = (a: number[], b: number[]) => `${line(a)} ${[...b].reverse().map((v, j) => `L${x(mids[8 - j]).toFixed(1)} ${y(toU(v)).toFixed(1)}`).join(' ')} Z`;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(v);
  const evenY = y(toU(pKm));
  const describe = (s: { name: string; c: Cell }) => {
    const ps = s.c.s50.map(toU);
    return `${s.name}: ${formatDuration(Math.min(...ps))} to ${formatDuration(Math.max(...ps))} per ${units === 'mi' ? 'mile' : 'km'}, slowest in ${sectionLabel(ps.indexOf(Math.max(...ps)), units)}.`;
  };
  // Direct labels placed where they clear every median line, the even-pace line and each other.
  const lineAt = (vals: number[], px: number) => {
    const km = ((px - m.l) / iw) * MARATHON_KM;
    if (km <= mids[0]) return y(toU(vals[0]));
    for (let i = 1; i < mids.length; i += 1) {
      if (km <= mids[i]) { const f = (km - mids[i - 1]) / (mids[i] - mids[i - 1]); return y(toU(vals[i - 1] + f * (vals[i] - vals[i - 1]))); }
    }
    return y(toU(vals[8]));
  };
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const placed: Box[] = [];
  const clear = (b: Box, skipEven = false) => {
    if (b.x0 < m.l - 2 || b.x1 > width - m.r + 2 || b.y0 < m.t + 2 || b.y1 > m.t + ih - 2) return false;
    for (let px = b.x0; px <= b.x1; px += 6) {
      for (const s of series) { const ly = lineAt(s.c.s50, px); if (ly > b.y0 - 3 && ly < b.y1 + 3) return false; }
      if (!skipEven && evenY > b.y0 - 3 && evenY < b.y1 + 3) return false;
    }
    return !placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  };
  const evenText = 'even pace';
  const evenW = evenText.length * 6.6;
  // A label that cannot sit clear of every line is dropped; the legend above the chart still names each line.
  const evenLabel = [
    { x: m.l + 4, y: evenY + 15, anchor: 'start' as const }, { x: m.l + 4, y: evenY - 7, anchor: 'start' as const },
    { x: width - m.r - 2, y: evenY - 7, anchor: 'end' as const }, { x: width - m.r - 2, y: evenY + 15, anchor: 'end' as const },
  ].find((c) => {
    const x0 = c.anchor === 'start' ? c.x : c.x - evenW;
    return clear({ x0, x1: x0 + evenW, y0: c.y - 10, y1: c.y + 2 }, true);
  }) ?? null;
  if (evenLabel) {
    const x0 = evenLabel.anchor === 'start' ? evenLabel.x : evenLabel.x - evenW;
    placed.push({ x0, x1: x0 + evenW, y0: evenLabel.y - 10, y1: evenLabel.y + 2 });
  }
  // A direct label belongs to its own line: that line stays within 14 px of the label's near edge, and comes closer
  // to the label than any other line (the other group, even pace) does.
  const gapTo = (b: Box, ly: number) => (ly < b.y0 ? b.y0 - ly : ly > b.y1 ? ly - b.y1 : 0);
  const ownsBox = (b: Box, own: Cell) => {
    let ownMin = Infinity; let ownMax = 0; let otherMin = gapTo(b, evenY);
    for (let px = b.x0; px <= b.x1 + 0.1; px += Math.max(1, (b.x1 - b.x0) / 8)) {
      const gap = gapTo(b, lineAt(own.s50, px));
      ownMin = Math.min(ownMin, gap); ownMax = Math.max(ownMax, gap);
      for (const o of series) if (o.c !== own) otherMin = Math.min(otherMin, gapTo(b, lineAt(o.c.s50, px)));
    }
    return ownMax <= 14 && ownMin < otherMin;
  };
  const faster = [...series].sort((a, b) => a.c.s50[1] - b.c.s50[1]);
  const labels = faster.map((s, k) => {
    const w = s.name.length * 7.1;
    const dirs = k === 0 ? [-1, 1] : [1, -1];
    for (const i of [1, 0, 2, 3, 4, 5, 6, 7]) {
      for (const [dir, shift] of dirs.flatMap((d) => [[d, -14], [d, 14 - w]])) {
        const lx = Math.min(width - m.r - 2 - w, Math.max(m.l + 2, x(mids[i]) + shift));
        const ly0 = lineAt(s.c.s50, lx);
        const ly1 = lineAt(s.c.s50, lx + w);
        const ly = dir < 0 ? Math.min(ly0, ly1) - 10 : Math.max(ly0, ly1) + 20;
        const box = { x0: lx, x1: lx + w, y0: ly - 12, y1: ly + 3 };
        if (clear(box) && ownsBox(box, s.c)) { placed.push(box); return { s, x: lx, y: ly }; }
      }
    }
    return null;
  }).filter((l): l is { s: (typeof series)[number]; x: number; y: number } => l !== null);
  const xTicks = narrow ? [10, 20, 30, 40] : [5, 10, 15, 20, 25, 30, 35, 40];
  const pick = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const km = ((clientX - box.left - m.l) / iw) * MARATHON_KM;
    let best = 0;
    mids.forEach((mid, i) => { if (Math.abs(mid - km) < Math.abs(mids[best] - km)) best = i; });
    setHover(best);
  };
  const tipX = hover === null ? 0 : Math.min(width - 92, Math.max(92, x(mids[hover])));
  return (
    <>
      <div className="legend-row pace-band-legend">
        {series.map((s) => <span key={s.key}><i style={{ background: s.colour }} />{s.name}</span>)}
        <span><i className="dashed" />Even pace {fmtPace(pKm, units)} · arithmetic reference</span>
      </div>
      <div ref={ref} className="viz pace-band-chart" onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}>
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img"
          aria-label={`Median pace in each of nine sections. ${series.map(describe).join(' ')} The dashed reference line is even pace, ${fmtPace(pKm, units)} (arithmetic).`}>
          <rect x={x(20)} y={m.t} width={x(MARATHON_KM) - x(20)} height={ih} fill="var(--paper-2)" opacity={0.6} />
          <text x={x(20) + 6} y={m.t - 8} className="annotation-sub">after 20 km</text>
          {ticks.map((v) => (
            <g key={v} className="grid">
              <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{formatDuration(v)}</text>
            </g>
          ))}
          <text x={4} y={m.t - 8} className="axis-label">/{units} · faster ↑</text>
          {xTicks.map((km) => <text key={km} x={x(km)} y={H - 12} textAnchor="middle">{units === 'mi' ? miles(km).replace(' mi', '') : km}</text>)}
          <text x={m.l - 8} y={H - 12} textAnchor="end" className="axis-label">{units === 'mi' ? 'mi' : 'km'}</text>
          {series.map((s) => (s.c.s25 && s.c.s75 ? <path key={`${s.key}-band`} d={area(s.c.s25, s.c.s75)} fill={s.colour} opacity={0.14} /> : null))}
          <line x1={m.l} x2={width - m.r} y1={evenY} y2={evenY} stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="5 4" />
          {series.map((s) => (
            <g key={s.key}>
              <path d={line(s.c.s50)} fill="none" stroke={s.colour} strokeWidth={2.4} strokeLinejoin="round" />
              {s.c.s50.map((v, i) => <circle key={i} cx={x(mids[i])} cy={y(toU(v))} r={hover === i ? 5 : 3.5} fill={s.colour} stroke="var(--card)" strokeWidth={2} />)}
            </g>
          ))}
          {labels.map((l) => <text key={l.s.key} className="annotation pace-band-halo" x={l.x} y={l.y} style={{ fill: l.s.key === 'held' ? HELD : 'var(--orange-ink)' }}>{l.s.name}</text>)}
          {evenLabel ? <text className="annotation-sub pace-band-halo" x={evenLabel.x} y={evenLabel.y} textAnchor={evenLabel.anchor}>{evenText}</text> : null}
          {hover !== null ? <line x1={x(mids[hover])} x2={x(mids[hover])} y1={m.t} y2={m.t + ih} stroke="var(--ink-3)" strokeWidth={1} /> : null}
        </svg>
        {hover !== null ? (
          <div className="viz-tooltip pace-band-tip" style={{ left: tipX, top: m.t + 4 }} aria-hidden="true">
            <b>{sectionLabel(hover, units)}</b>
            {series.map((s) => (
              <span key={s.key}><i style={{ background: s.colour }} />{s.name}: {formatDuration(toU(s.c.s50[hover]))}{s.c.s25 && s.c.s75 ? ` (${formatDuration(toU(s.c.s25[hover]))}–${formatDuration(toU(s.c.s75[hover]))})` : ''}</span>
            ))}
            <span>Even pace (arithmetic): {formatDuration(toU(pKm))}</span>
          </div>
        ) : null}
      </div>
      <details className="pace-band-details">
        <summary>Section paces as a table</summary>
        <div className="tool-table-wrap">
          <table className="tool-table pace-band-table">
            <thead><tr><th scope="col">Section</th>{series.map((s) => <th key={s.key} scope="col">{s.name}</th>)}</tr></thead>
            <tbody>
              {SECTION_BOUNDS.map((_, i) => (
                <tr key={i}>
                  <th scope="row">{sectionLabel(i, units)}</th>
                  {series.map((s) => (
                    <td key={s.key}>{formatDuration(toU(s.c.s50[i]))}{s.c.s25 && s.c.s75 ? <span className="pace-band-range">{formatDuration(toU(s.c.s25[i]))}–{formatDuration(toU(s.c.s75[i]))}</span> : null}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <caption>Median pace per {units === 'mi' ? 'mile' : 'km'} in each section, with the 25th–75th percentile range below (Pace Notes data). Even pace for reference: {fmtPace(pKm, units)} (arithmetic).</caption>
          </table>
        </div>
      </details>
    </>
  );
}

/** Share of the window with a sustained slowdown, and the section where it began. */
function OnsetPanel({ all, slow, units, where, dim }: { all: Cell; slow: Cell; units: UnitSystem; where: string; dim: boolean }) {
  const onset = all.onset ?? [];
  const total = onset.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...onset, 1);
  return (
    <EvidencePanel kind="data" title="Where the sustained slowdowns began" id="pace-band-onset"
      meta={`${count(slow.n)} of ${count(all.n)} complete finishes in this window ${where} had a sustained slowdown (${pct(all.sd ?? slow.n / all.n)}). The section where it started:`}>
      <ol className={`pace-band-onset${dim ? ' pace-band-dim' : ''}`}>
        {onset.map((c, i) => (
          <li key={i}>
            <span className="pace-band-onset-label">{sectionLabel(4 + i, units)}</span>
            <span className="pace-band-onset-bar" aria-hidden="true"><i style={{ width: `${(c / max) * 100}%` }} /></span>
            <span className="pace-band-onset-value">{count(c)} <small>{pct(c / total, 0)}</small></span>
          </li>
        ))}
      </ol>
      <p className="tool-note">
        {SLOWDOWN_DEFINITION} Source: <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">{SLOWDOWN_CITATION.label}</a>. These are observed shares of complete finishes, not anyone’s chance: runners who stopped are not in the data.
      </p>
    </EvidencePanel>
  );
}

/** Print options, a live preview of the cut-out strips, and the strips themselves for @media print. */
function PrintPanel({ goal, pKm, units, rows, interval, overrun, place, genderWord, observed, profile, showBack, onBack, onPrint, waiting }: {
  goal: number; pKm: number; units: UnitSystem; rows: ReturnType<typeof splitTable>; interval: SplitInterval; overrun: number; place: string; genderWord: string;
  observed: ObservedOk | null; profile: RouteProfile | null; showBack: boolean; onBack: (v: boolean) => void; onPrint: (mode: 'strip' | 'page') => void;
  /** The goal field holds text that is not a goal: printing waits until it is fixed. */
  waiting: boolean;
}) {
  const held = observed?.held ?? null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const wrapWidth = useWidth(wrapRef, 760);
  const SHEET_PX = (18.4 + 0.9) * (96 / 2.54);
  const zoom = Math.min(1, Math.max(0.3, (wrapWidth - 30) / SHEET_PX));
  // Split strips repeat every mile or km, plus halfway; the mat strip carries the 5 km mats and the finish.
  const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  const splitCells = interval === '5k' ? [] : rows.filter((r) => !r.finish && (r.halfway || isWhole(interval === 'mi' ? r.km / KM_PER_MILE : r.km)));
  const perStrip = splitCells.length ? Math.ceil(splitCells.length / Math.ceil(splitCells.length / 12)) : 0;
  const strips: (typeof splitCells)[] = [];
  for (let i = 0; i < splitCells.length; i += perStrip) strips.push(splitCells.slice(i, i + perStrip));
  const caption = held && observed
    ? `H = held-pace median of ${count(held.n)} finishes ${formatDuration(observed.lo, true)}–${formatDuration(observed.hi, true)}, ${observed.place}${observed.genderWord ? `, ${observed.genderWord}` : ''}, no sustained slowdown (Pace Notes data; observed, not a plan). Big numbers: even-pace arithmetic.`
    : 'Even-pace arithmetic. No observed held-pace group is published for this selection.';
  return (
    <section className="tool-panel pace-band-print-panel" aria-labelledby="pace-band-print-title">
      <header className="tool-panel-head">
        <span className="tool-badges"><span className="evidence-badge evidence-arithmetic">Arithmetic</span>{held ? <span className="evidence-badge evidence-data">Pace Notes data</span> : null}</span>
        <h2 className="tool-panel-title" id="pace-band-print-title">Print your wristband</h2>
        <p className="tool-panel-meta">Strips about 2.5 cm wide, with dashed cut guides. Big numbers are even-pace elapsed times; the small “H” line is the held-pace median at each mat. Print at 100% scale.</p>
      </header>
      <div className="pace-band-print-controls no-print">
        <button type="button" className="button-primary" disabled={waiting} aria-describedby={waiting ? 'pace-band-print-held' : undefined} onClick={() => onPrint('strip')}>Print wristband strips</button>
        <button type="button" className="button-secondary" disabled={waiting} aria-describedby={waiting ? 'pace-band-print-held' : undefined} onClick={() => onPrint('page')}>Print full page</button>
        {waiting ? <p className="pace-band-print-held" id="pace-band-print-held">Fix the goal above to print. The preview still shows {fmtGoal(goal)}.</p> : null}
        {profile ? (
          <label className="tool-check"><input type="checkbox" checked={showBack} onChange={(e) => onBack(e.target.checked)} />Add a route elevation strip for the back ({profile.city})</label>
        ) : null}
      </div>
      <div className={`pace-band-sheet-wrap${waiting ? ' pace-band-held-dim' : ''}`} ref={wrapRef}>
        <div className="pace-band-sheet" style={{ zoom }}>
          <p className="pace-band-sheet-head">Pace Notes · pace band · {fmtGoal(goal)} goal · {place}{genderWord ? ` · ${genderWord}` : ''} · cut along the dashed lines</p>
          <div className="pace-band-strip is-mats">
            <div className="pace-band-cell is-lead">
              <span className="k">Goal</span>
              <b>{fmtGoal(goal)}</b>
              <span className="h">{formatDuration(perUnit(pKm, 'mi'))}/mi · {formatDuration(pKm)}/km{overrun ? ` · watch ${fmtPace(watchTarget(pKm, overrun), units)}` : ''}</span>
            </div>
            {CHECKPOINTS.map((km, i) => (
              <div key={km} className={`pace-band-cell${i === 8 ? ' is-finish' : ''}`}>
                <span className="k">{i === 8 ? 'Finish' : `${km}K`} <small>{i === 8 ? '26.2mi' : `${(km / KM_PER_MILE).toFixed(1)}mi`}</small></span>
                <b>{formatDuration(i === 8 ? goal : pKm * km)}</b>
                <span className="h">{held ? `H ${formatDuration(held.e50[i])}` : ' '}</span>
              </div>
            ))}
            <p className="pace-band-strip-caption">{caption}</p>
          </div>
          {strips.map((cells, s) => (
            <div key={s} className="pace-band-strip is-splits" style={{ ['--cells' as string]: cells.length }}>
              {cells.map((r) => (
                <div key={r.km} className={`pace-band-cell${r.halfway ? ' is-half' : r.mat ? ' is-mat' : ''}`}>
                  <span className="k">{r.halfway ? 'Half' : interval === 'mi' ? `Mi ${Math.round(r.km / KM_PER_MILE)}` : `Km ${Math.round(r.km)}`}</span>
                  <b>{formatDuration(r.elapsed)}</b>
                </div>
              ))}
              <p className="pace-band-strip-caption">Even pace {fmtGoal(goal)} · {interval === 'mi' ? 'each mile' : 'each km'} · strip {s + 1} of {strips.length} · arithmetic</p>
            </div>
          ))}
          {showBack && profile ? <ElevationStrip profile={profile} units={units} /> : null}
        </div>
      </div>
      {zoom < 0.98 ? <p className="tool-note no-print">Preview scaled to fit your screen. It prints at full size: about {units === 'mi' ? '7¼ in' : '18.4 cm'} long and {units === 'mi' ? '1 in' : '2.5 cm'} wide per strip.</p> : null}
    </section>
  );
}

/** Full height of the printed elevation strip, the same on every course, so flat courses print flat. */
const ELEVATION_SCALE_M = 200;

/** Supplied route elevation as a strip for the back of the band. Context only; never used in a calculation. */
function ElevationStrip({ profile, units }: { profile: RouteProfile; units: UnitSystem }) {
  const W = 700;
  const H = 62;
  const top = 6;
  const pts = profile.m;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const range = Math.max(hi - lo, ELEVATION_SCALE_M);
  const x = (km: number) => (km / profile.km) * W;
  const y = (v: number) => top + (1 - (v - lo) / range) * (H - top - 4);
  // The supplied profile stops at its last sample (e.g. 42.0 of 42.184 km); nothing is drawn beyond it.
  const lastKm = Math.min((pts.length - 1) * profile.step, profile.km);
  const coords = pts.map((v, i) => `${x(Math.min(i * profile.step, profile.km)).toFixed(1)},${y(v).toFixed(1)}`);
  const fill = `M0 ${H} L${coords.join(' L')} L${x(lastKm).toFixed(1)} ${H} Z`;
  const scale = units === 'mi' ? `${Math.round(ELEVATION_SCALE_M * 3.28084)} ft` : `${ELEVATION_SCALE_M} m`;
  return (
    <div className="pace-band-strip is-back">
      <svg viewBox={`0 0 ${W} ${H + 12}`} preserveAspectRatio="none" role="img"
        aria-label={`Supplied route elevation for ${profile.city}, from ${elevationLabel(profile.min, units)} to ${elevationLabel(profile.max, units)}, drawn on a fixed ${scale} vertical scale.`}>
        <path d={fill} fill="#D9D2C3" stroke="none" />
        <polyline points={coords.join(' ')} fill="none" stroke="#15171C" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {[5, 10, 15, 20, 25, 30, 35, 40].filter((km) => km < profile.km).map((km) => (
          <g key={km}>
            <line x1={x(km)} x2={x(km)} y1={top} y2={H} stroke="#15171C" strokeWidth={0.6} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <text x={x(km)} y={H + 10} textAnchor="middle" fontSize="8.5" fontFamily="var(--mono)">{km}K</text>
          </g>
        ))}
      </svg>
      <p className="pace-band-strip-caption">Back · {profile.race} route elevation, {elevationLabel(profile.min, units)} to {elevationLabel(profile.max, units)} · same vertical scale on every course: strip height = {scale} · supplied current route; historical validity unknown; bridge decks may be missing · context only, not used in any time</p>
    </div>
  );
}
