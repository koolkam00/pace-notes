'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { EvidenceTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import { useUnits } from '@/components/UnitsProvider';
import AsRunTable, { AsRunNote } from '@/components/tools/AsRunTable';
import BandChoice, { KickerText, TerrainLine } from '@/components/tools/BandChoice';
import PaceBandStrip, { type RouteProfile } from '@/components/tools/PaceBandStrip';
import StretchTables from '@/components/tools/StretchTables';
import MatLines, { aheadText } from '@/components/tools/MatLines';
import { Choice, GoalBar, ShareBar, Stepper } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import KeypadHint from '@/components/KeypadHint';
import Values from '@/components/ui/Values';
import { loadInsight } from '@/lib/insights';
import { loadShard, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { bandChoice, bandKicker, bandMinute, bandRows, bandView, climbsLine, featureFor, goalPace, matRows, noTerrainLine, tidyChoice } from '@/lib/tools/terrain-band';
import { MARATHON_KM, splitTable, watchTarget, type SplitInterval } from '@/lib/tools/pace';
import { CHECKPOINTS, PACE_BAND_INDEX, cellOf, fmtGoal, fmtPace, paceBandShardPath, type PaceBandCell as Cell } from '@/lib/tools/pace-band-data';
import type { NoTerrainWhy, TerrainCourse, TerrainFeature } from '@/lib/tools/terrain-data';
import { PACES_LABEL, pacesUnit, stretchCount, stretchesTitle, stripPaces, tidyPaces, type StripPaces } from '@/lib/tools/stretch-paces';
import { formatDuration, formatHM, parseDuration } from '@/lib/tools/time';
import { keypadInput } from '@/lib/keypad';
import { DEFAULT_UNITS, KM_PER_MILE, matLabel, type UnitSystem } from '@/lib/units';
import { unitHref } from '@/lib/unit-preference';
import { count } from '@/lib/viz/format';

export type { RouteProfile };
/** A course other Pace Notes data knows but the pace band does not publish, with the reason (built at export time). */
export interface UnpublishedCourse { city: string; note: string }

const GOAL_MIN_S = 90 * 60;
const GOAL_MAX_S = 480 * 60;
const OBS_MIN = 150;
const OBS_MAX = 390;
/** The course chooser covers goals from 2:30 to 6:30 (minutes). */
/** Typing commits a readable goal after this pause, so a prefix such as "3:3" on the way to "3:35" is not taken as the goal. */
const COMMIT_MS = 400;
/** After this pause, an unreadable or out-of-range goal is flagged even before the field loses focus. */
const PAUSE_MS = 900;
const EMPTY_GOAL = 'Type a goal, such as 3:30.';
/**
 * `pace=even` keeps the visitor's even-pace choice; terrain, the default where the course has it, stays out. `paces=1`
 * keeps each stretch's pace on the strips; off, the default, stays out.
 */
const DEFAULTS = { goal: '4:00', course: 'all', g: 'all', split: '', watch: '0', print: 'strip', back: '0', pace: '', paces: '' };

type Gender = 'all' | 'men' | 'women';
const GENDER_OPTIONS: { value: Gender; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'women', label: 'Women' }, { value: 'men', label: 'Men' }];
const ROW_OPTIONS: { value: SplitInterval; label: string }[] = [{ value: 'mi', label: 'Miles' }, { value: 'km', label: 'Kilometers' }, { value: '5k', label: '5K mats' }];
const WATCH_OPTIONS = [{ value: '0', label: 'Exact' }, { value: '0.5', label: '+0.5%' }, { value: '1', label: '+1%' }, { value: '1.5', label: '+1.5%' }];

const clampGoal = (s: number) => Math.min(GOAL_MAX_S, Math.max(GOAL_MIN_S, s));
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
/** A build-time map's own entry for a slug from the address (never one inherited from Object, such as `constructor`). */
const own = <T,>(map: Record<string, T>, key: string): T | null => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null);

type Observed =
  | { state: 'off'; message: string; retry: boolean }
  | { state: 'loading' }
  | { state: 'unavailable'; title: string; message: string; range: string | null }
  | { state: 'ok'; minute: number; all: Cell; held: Cell | null; slow: Cell | null; lo: number; hi: number; where: string; place: string; genderWord: string };
type ObservedOk = Extract<Observed, { state: 'ok' }>;

/** A finish gap in plain words: "5 seconds", "1 second", "1:05". */
const spokenGap = (seconds: number) => { const s = Math.round(Math.abs(seconds)); return s < 60 ? `${s} second${s === 1 ? '' : 's'}` : formatDuration(s); };

export default function PaceBand({ indexSha, profiles, unpublished, cities = {}, terrain = {}, why = null, how }: {
  indexSha: string | null; profiles: RouteProfile[]; unpublished: Record<string, UnpublishedCourse>;
  /** Every course the pace band publishes, by slug, with its city, from the index at build time. */
  cities?: Record<string, string>;
  /** Each terrain course's splits (tools/course-terrain.json, terrainProps), by slug. */
  terrain?: Record<string, TerrainCourse>;
  /** Why every other course has none, by slug; null when the terrain file is not in the build (then no line shows). */
  why?: Record<string, NoTerrainWhy> | null;
  /** The page's methods anchor, the last line of the observed mats' "All numbers" (ToolEnd `numbers`). */
  how?: string;
}) {
  const { units } = useUnits();
  const [q, setQuery, ready, fromUrl] = useQueryState(DEFAULTS);
  // What the visitor has changed on this page: anything (hides the example note) and the goal (kept in the URL even at 4:00).
  const [changed, setChanged] = useState({ any: false, goal: false });
  const setQ = (patch: Partial<typeof DEFAULTS>) => { setChanged((c) => ({ any: true, goal: c.goal || 'goal' in patch })); setQuery(patch); };
  // The goal field's own problem (unreadable, out of range or empty) once it shows; the results then hold the last good goal.
  const [fieldProblem, setFieldProblem] = useState<string | null>(null);

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

  // The address carries units=km when the band is in kilometres (rows follow the units); miles, the default, need no
  // parameter, so the miles address stays clean. The Copy link button always names the units on screen.
  // A goal from a link or from the visitor stays in the URL even when it is 4:00 (useQueryState drops defaults), so a
  // reload or a shared link does not present it as the example.
  const goalExplicit = fromUrl.has('goal') || changed.goal;
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    let dirty = false;
    if (url.searchParams.get('units') !== (units === DEFAULT_UNITS ? null : units)) dirty = true;
    if (goalExplicit && !url.searchParams.has('goal')) { url.searchParams.set('goal', q.goal); dirty = true; }
    if (!dirty) return;
    const search = url.searchParams.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',');
    window.history.replaceState(window.history.state, '', unitHref(`${url.pathname}${search ? `?${search}` : ''}${url.hash}`, units));
  }, [ready, units, q, goalExplicit]);

  // Verified index, then one verified shard per course × recorded gender. `retry` re-runs both loads.
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState<PaceBandIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  useEffect(() => {
    if (!indexSha) return;
    let live = true;
    loadInsight<PaceBandIndex>(PACE_BAND_INDEX, indexSha).then((d) => { if (live) { setIndex(d); setIndexError(false); } }, () => { if (live) setIndexError(true); });
    return () => { live = false; };
  }, [indexSha, retry]);
  const shardPath = paceBandShardPath(course, gender);
  const [shard, setShard] = useState<{ path: string; data: PaceBandShard | null } | null>(null);
  useEffect(() => {
    if (!index || !index.shards?.[shardPath]) return;
    let live = true;
    loadShard<PaceBandShard>(index, shardPath).then((d) => { if (live) setShard({ path: shardPath, data: d }); }, () => { if (live) setShard({ path: shardPath, data: null }); });
    return () => { live = false; };
  }, [index, shardPath, retry]);
  const tryAgain = () => { setIndexError(false); setShard(null); setRetry((r) => r + 1); };

  const scope = index?.scopes.find((s) => s.slug === course) ?? null;
  // A course other data knows (Prague, say) but the pace band does not publish: named, with the reason.
  const known = course !== 'all' && !scope && Object.prototype.hasOwnProperty.call(unpublished, course) ? unpublished[course] : null;
  // The course's terrain splits, known at build time, so the band never waits for a file.
  const courseTerrain = course === 'all' ? null : own(terrain, course);
  // A course the pace band publishes, known to the index or to the build, before the index loads.
  const published = course !== 'all' && (Boolean(scope) || own(cities, course) !== null || courseTerrain !== null);
  // Never echo an unknown slug from the URL into the copy.
  const city = scope?.city ?? known?.city ?? own(cities, course) ?? courseTerrain?.city ?? null;
  const place = course === 'all' ? 'All courses' : city ?? 'this course';
  const where = course === 'all' ? 'on all courses' : city ? `in ${city}` : 'on this course';
  const genderWord = gender === 'all' ? '' : gender === 'men' ? 'men' : 'women';
  // Observed windows use whole minutes. A goal with seconds uses the minute at or below it, so every finish in the window beat the goal.
  const minute = goal === null ? null : bandMinute(goal);

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
      return { state: 'unavailable', title: 'Not published for this selection.', message: 'The even-pace band still works.', range: null };
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
    if (!all) return { state: 'unavailable', title: 'Not published for this goal.', message: `Too few finishes ran ${formatDuration(lo, true)} to ${formatDuration(hi, true)} ${where}${genderWord ? ` (recorded as ${genderWord})` : ''} to show.`, range };
    return { state: 'ok', minute, all, held: cellOf(shard.data.groups.held, minute), slow: cellOf(shard.data.groups.slowdown, minute), lo, hi, where, place, genderWord };
  }, [indexSha, indexError, index, scope, known, gender, shardPath, where, place, genderWord, minute, shard]);

  // While a new shard loads, keep the last result for the same minute on screen (dimmed, aria-busy) instead of collapsing the page.
  const [settled, setSettled] = useState<Observed | null>(null);
  useEffect(() => { if (observed.state !== 'loading') setSettled(observed); }, [observed]);
  const stale = observed.state === 'loading' && settled?.state === 'ok' && settled.minute === minute ? settled : null;
  const shown: Observed = stale ?? observed;
  const ok: ObservedOk | null = shown.state === 'ok' ? shown : null;
  const fresh: ObservedOk | null = observed.state === 'ok' ? observed : null;

  // The band (owner decision, October 23, 2026): on a course with terrain splits (lib/tools/terrain-band.ts), the
  // visitor's goal spread over the corrected route at an even effort, the same for every recorded gender, unless the
  // visitor chose even pace; on all courses, and on a course without them, even pace. The finishes near the goal never
  // change the band: they load for their own section below, and the band never waits for them.
  const { mode, banded, offered } = bandView({ terrain: courseTerrain, choice: q.pace });
  // No terrain splits: the one line says why (no checked route profile, or one that did not pass its check). Nothing on
  // all courses, for a course the data does not know (the finishes section says so) or without the terrain file.
  const bandState = offered ? 'choice' as const : course !== 'all' && (published || known) ? 'none' as const : 'off' as const;
  const noTerrain = bandState === 'none' && why && city ? noTerrainLine(city, own(why, course) ?? 'profile') : '';
  // A hand-edited `pace` (pace=foo, pace=EVEN) is the default and leaves the address, as does `even` on all courses, where
  // no choice is offered; a choice of even pace on a course stays and carries to the next course, but not through All
  // courses (tidyChoice).
  useEffect(() => {
    if (ready && q.pace !== tidyChoice(q.pace, course === 'all')) setQuery({ pace: tidyChoice(q.pace, course === 'all') });
  }, [ready, q.pace, course, setQuery]);
  // Each stretch's pace on the strips (owner request, October 29, 2026): `paces=1` stays, any other value leaves the
  // address (tidyPaces); off is never written. A link with paces=1 opens the print options on arrival, as rows and a watch
  // do; the fold then stays open while the box is ticked or unticked.
  useEffect(() => {
    if (ready && q.paces !== tidyPaces(q.paces)) setQuery({ paces: tidyPaces(q.paces) });
  }, [ready, q.paces, setQuery]);
  const pacesOn = q.paces === '1';
  const [pacesLinked, setPacesLinked] = useState(false);
  useEffect(() => { if (ready && fromUrl.has('paces') && q.paces === '1') setPacesLinked(true); }, [ready, fromUrl, q.paces]);
  const pKm = goal === null ? null : goal / MARATHON_KM;
  const rows = useMemo(() => (goal === null ? [] : bandRows(goal, interval, banded)), [goal, interval, banded]);
  // The terrain splits' nine mat times for the mat strip; the climbs by the band's own rows (miles or km; the 5K mats by
  // the page's units).
  const mats = goal !== null && banded ? matRows(goal, banded).map((m) => m.terrain!) : null;
  const climbText = goal !== null && banded ? climbsLine(goal, banded, interval === 'km' ? 'km' : interval === 'mi' ? 'mi' : units) : '';
  // Each stretch's pace, like the climbs, in the band's own rows' units (miles or km; the 5K mats by the page's units), so
  // a mile cell's pace is its mile time.
  const paceUnits: UnitSystem = interval === 'km' ? 'km' : interval === 'mi' ? 'mi' : units;
  const paces = useMemo(() => (goal !== null && pacesOn ? stripPaces(goal, banded, paceUnits) : null), [goal, pacesOn, banded, paceUnits]);
  const stretches = goal === null ? null : <StretchTables goal={goal} terrain={banded} units={paceUnits} />;
  // Every marker on the band as a table: in the print options' fold, and printed with the full page.
  const wrist = goal === null || pKm === null ? null
    : <Wristband rows={rows} goal={goal} pKm={pKm} units={units} overrun={overrun} even={banded ? splitTable(goal, MARATHON_KM, interval) : null} features={banded?.features ?? []} />;
  const profile = profiles.find((p) => p.slug === course) ?? null;
  const showBack = q.back === '1' && profile !== null;
  // Results from untouched example inputs: nothing in the link, nothing changed yet.
  const isExample = ready && fromUrl.size === 0 && !changed.any;
  // The field holds text that is not a goal while the results still show the last good one.
  const held = fieldProblem !== null && goal !== null;
  const busy = held;
  const gap20 = ok && ok.held && ok.slow ? ok.held.e50[3] - ok.slow.e50[3] : null;

  // One always-mounted, visually hidden status line: a short summary, debounced while typing. The first settled result is not announced.
  const [notice, setNotice] = useState('');
  const freshGap = fresh && fresh.held && fresh.slow ? fresh.held.e50[3] - fresh.slow.e50[3] : null;
  const summary = goal === null || pKm === null ? 'No band yet. Type a goal from 1:30 to 8:00.' : observed.state === 'loading' ? null : [
    notice,
    held ? `${fieldProblem} The results below still show ${fmtGoal(goal)}.` : '',
    banded ? `${fmtGoal(goal)} goal ${where}: terrain splits, average ${fmtPace(pKm, units)}.`
      : `${fmtGoal(goal)} goal: even pace ${fmtPace(pKm, units)}.`,
    fresh && freshGap !== null ? `Pace Notes data: at the 20 km mat, finishes with a sustained slowdown were a median ${formatDuration(Math.abs(freshGap))} ${freshGap >= 0 ? 'earlier' : 'later'} than those without one.` : '',
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
    const h = document.querySelector<HTMLElement>('#pace-band-observed-title');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }, [moveFocus]);
  const widen = (patch: { course?: string; g?: string }, message: string) => { setQ(patch); setNotice(message); setMoveFocus((n) => n + 1); };

  // The full page prints the tables inside their Values disclosures, so it opens the closed ones for the print and closes
  // them again afterwards.
  const printAs = (mode: 'strip' | 'page') => {
    setQuery({ print: mode });
    const opened = mode === 'page' ? [...document.querySelectorAll<HTMLDetailsElement>('.pace-band-root details.values:not([open])')] : [];
    opened.forEach((d) => { d.open = true; });
    if (opened.length) window.addEventListener('afterprint', () => opened.forEach((d) => { d.open = false; }), { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const fallbacks = (
    <div className="pace-band-actions">
      {course !== 'all' ? <button type="button" className="btn btn-secondary is-compact" onClick={() => widen({ course: 'all' }, 'Showing All courses in the observed columns.')}>Switch to All courses</button> : null}
      {gender !== 'all' ? <button type="button" className="btn btn-secondary is-compact" onClick={() => widen({ g: 'all' }, 'Showing all genders in the observed columns.')}>Switch to all genders</button> : null}
    </div>
  );
  const badGoal = q.goal.trim().slice(0, 24);

  const gapAt = (cell: Cell | null, i: number) => (cell && pKm !== null ? cell.e50[i] - (i === 8 ? goal! : pKm * CHECKPOINTS[i]) : null);
  const slowAt20 = ok?.slow && ok.held ? ok.held.e50[3] - ok.slow.e50[3] : null;
  const finishGap = ok?.slow && ok.held ? ok.slow.e50[8] - ok.held.e50[8] : null;

  return (
    <div className="pace-band-root" data-print={printMode}>
      <p className="sr-only" role="status">{status}</p>
      <div className="tool-workspace">
        {/* The answer first (the analyses' grammar): the band's pace for the example, then the inputs that make it yours. */}
        <div className="tool-results tool-answer">
          {goal === null || pKm === null ? (
            <p className="tool-empty">
              {badGoal ? <>The goal in this link, “{badGoal}”, is not a marathon time from 1:30 to 8:00. </> : null}
              Type a goal between 1:30 and 8:00 (for example 3:30) to build your band.
            </p>
          ) : (
            <>
              {held ? (
                <p className="tool-note pace-band-held">
                  Showing <b>{fmtGoal(goal)}</b>. {fieldProblem === EMPTY_GOAL ? 'Type a goal below to update the band.' : 'Fix the goal below to update the band; nothing here follows it until then.'}
                </p>
              ) : null}
              {/* The answer is the band itself (critic round 3): the wristband to print opens the page, its one Print
                  button under it and the print options folded below, never a second card repeating the planner's pace. */}
              <PrintPanel goal={goal} pKm={pKm} units={units} rows={rows} interval={interval} overrun={overrun} place={place} genderWord={genderWord}
                kicker={bandKicker({ goal, place, terrain: banded, units, overrun, example: isExample })} busy={busy}
                line={banded ? <TerrainLine goal={goal} city={banded.city} climbs={climbText} /> : null}
                choice={<BandChoice id="pace-band-choice" state={bandState} mode={mode} onChange={(m) => setQ({ pace: bandChoice(m) })} line={noTerrain} className="no-print" />}
                profile={profile} showBack={showBack} onBack={(v) => setQ({ back: v ? '1' : '0' })} onPrint={printAs} waiting={held}
                mats={mats} terrain={Boolean(banded)} table={wrist} paces={paces} pacesOn={pacesOn} paceUnits={paceUnits} onPaces={(v) => setQ({ paces: v ? '1' : '' })}
                stretches={pacesOn ? stretches : null}
                controls={<>
                  <div className="tool-field">
                    <span className="tool-label" id="pace-band-rows">Rows</span>
                    <div role="group" aria-labelledby="pace-band-rows"><Choice label="Band rows" small value={interval} onChange={(v) => setQ({ split: v })} options={ROW_OPTIONS} /></div>
                  </div>
                  <div className="tool-field">
                    <span className="tool-label" id="pace-band-watch">If my watch reads long</span>
                    <div role="group" aria-labelledby="pace-band-watch"><Choice label="Watch reads the course long by" small value={String(overrun * 100)} onChange={(v) => setQ({ watch: v })} options={WATCH_OPTIONS} /></div>
                  </div>
                </>}
                optionsOpen={Boolean(q.split) || overrun !== 0 || pacesLinked}
                values={<>
                  <Values id="pace-band-rows-values" how={banded ? how : undefined} caption={banded ? `Every marker on the band: terrain splits (timing points in bold) beside even pace for ${fmtGoal(goal)}` : `Every marker on the band: even-pace elapsed time for ${fmtGoal(goal)}`} count={rows.length}>
                    {wrist}</Values>
                  <Values id="pace-band-stretch-values" count={stretchCount(paceUnits)} caption={stretchesTitle(paceUnits)}>{stretches}</Values>
                </>} />
            </>
          )}
        </div>

        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Pace band inputs">
          <h2>Your race</h2>
          <GoalField seconds={goal} raw={q.goal} onChange={setGoal} onStep={step} onProblem={setFieldProblem}
            onEdit={() => setChanged((c) => (c.any ? c : { ...c, any: true }))} />
          <div className="tool-field">
            <label htmlFor="pace-band-course">Course</label>
            <select id="pace-band-course" value={course} onChange={(e) => setQ({ course: e.target.value })}>
              <option value="all">All courses</option>
              {index ? (
                <>
                  {!scope && course !== 'all' ? <option value={course} disabled>{known ? `${known.city} · not published` : 'Unknown course'}</option> : null}
                  {index.scopes.filter((s) => s.slug !== 'all').map((s) => <option key={s.slug} value={s.slug}>{s.city ?? s.slug}</option>)}
                </>
              ) : course !== 'all' ? <option value={course}>{city ?? 'Loading courses…'}</option> : null}
            </select>
          </div>
          <div className="tool-field">
            <span className="tool-label" id="pace-band-gender">Recorded gender</span>
            <div role="group" aria-labelledby="pace-band-gender" className="ph-no-capture"><Choice label="Recorded gender" value={gender} onChange={(v) => setQ({ g: v })} options={GENDER_OPTIONS} small /></div>
          </div>
        </form>

        <div className="tool-results">
          {goal !== null && pKm !== null ? (
            <>
              {/* The finishes near the goal carry the Pace Notes data badge at every width. At even pace it is the page's one
                  badge (the band above is the visitor's own times); on terrain the band carries its own, Published
                  research. They are as run, never scaled to the goal and never the band, with the forewarning. */}
              <section className="tool-panel pace-band-observed" id="pace-band-observed" aria-labelledby="pace-band-observed-title">
                <EvidenceTag kind="data" />
                {stale ? <p className="tool-note">Loading {place}{genderWord ? `, ${genderWord}` : ''}…</p> : null}
                {observed.state === 'loading' && !stale ? <p className="tool-state" id="pace-band-observed-title">Loading the finishes near {fmtGoal(goal)}…</p> : null}
                {shown.state === 'off' ? (
                  <div className="tool-state is-error pace-band-error">
                    <p id="pace-band-observed-title">{shown.message}</p>
                    {shown.retry ? <button type="button" className="btn btn-secondary is-compact" onClick={tryAgain}>Try again</button> : null}
                  </div>
                ) : null}
                {shown.state === 'unavailable' ? (
                  <div className="pace-band-unavailable">
                    <p id="pace-band-observed-title"><strong>{shown.title}</strong> {shown.message}</p>
                    {shown.range ? <p>{shown.range}</p> : null}
                    {fallbacks}
                  </div>
                ) : null}
                {ok ? (
                  <div className={stale ? 'pace-band-dim' : undefined}>
                    {slowAt20 !== null && finishGap !== null ? (
                      <p className="tool-nugget-text" id="pace-band-observed-title">
                        {/* The finish window named, as the split check names its own: the two pages' gaps are for two
                            different windows, so neither reads as the other's number. */}
                        {/* Where they were at 20K, and how far apart their medians finished (critic round 5: the page's lesson,
                            minutes banked early and the same finish, sat only in the key). An observation of the two medians,
                            never a cause. */}
                        Of finishes from {formatHM(Math.floor(ok.lo / 60) * 60)} to {formatHM(Math.floor(ok.hi / 60) * 60)} {ok.where}, those with a <SlowdownTerm /> passed 20K <em>{formatDuration(Math.abs(slowAt20))} {slowAt20 >= 0 ? 'ahead of' : 'behind'}</em> those without one, and finished {Math.abs(finishGap) < 0.5 ? 'level' : `${spokenGap(finishGap)} apart`}.
                      </p>
                    ) : (
                      <p className="tool-nugget-text" id="pace-band-observed-title">Where finishes from {formatDuration(ok.lo, true)} to {formatDuration(ok.hi, true)} {ok.where} were at each mat.</p>
                    )}
                    <p className="tool-note pace-band-asrun"><AsRunNote sd={ok.all.sd} /></p>
                    {ok.held || ok.slow ? (
                      <MatLines units={units}
                        bracket={slowAt20 !== null && ok.held && ok.slow ? { km: 20, label: formatDuration(Math.abs(slowAt20)) } : undefined}
                        lines={[
                          // The group the sentence is about (the slowdown, ahead at 20K) in ink, the other quiet; the gap the
                          // sentence names is the chart's one orange, the bracket at 20K (round 6: slower is never orange).
                          ...(ok.held ? [{ key: 'held', label: 'No sustained slowdown', tone: 'quiet' as const, gaps: CHECKPOINTS.map((_, i) => gapAt(ok.held, i)!) }] : []),
                          ...(ok.slow ? [{ key: 'slow', label: 'Sustained slowdown', tone: 'ink' as const, gaps: CHECKPOINTS.map((_, i) => gapAt(ok.slow, i)!) }] : []),
                        ]}
                        label={`Median elapsed time against even pace for ${fmtGoal(goal)} at every mat, for finishes from ${formatDuration(ok.lo, true)} to ${formatDuration(ok.hi, true)} ${ok.where}.${ok.held ? ` No sustained slowdown: ${aheadText(gapAt(ok.held, 3)!)} at 20 km.` : ''}${ok.slow ? ` Sustained slowdown: ${aheadText(gapAt(ok.slow, 3)!)} at 20 km.` : ''}`} />
                    ) : null}
                    <Values id="pace-band-observed-values" how={how} caption={`Median elapsed time at each mat, finishes from ${formatDuration(ok.lo, true)} to ${formatDuration(ok.hi, true)} ${ok.where}${ok.genderWord ? `, recorded as ${ok.genderWord}` : ''}`} count={9}>
                      <AsRunTable cells={ok} units={units} />
                    </Values>
                  </div>
                ) : null}
              </section>

              <div className="print-only pace-band-print-notes">
                <p>{banded ? 'Terrain splits from published research' : 'Pace Notes pace band'} · splithappens.run/tools/pace-band</p>
              </div>

              {/* No next-step row: the chapter's next card follows, the page's one way forward (section 00, cut 4). */}

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
            const value = keypadInput(e.target, e.nativeEvent);
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
      <p className={`tool-field-hint${show ? ' is-error' : ''}`} id={`${id}-hint`}>{show ? problem : 'h:mm or h:mm:ss, from 1:30 to 8:00.'}<KeypadHint /></p>
    </div>
  );
}

/**
 * Every marker on the band, as a table: even-pace elapsed time, calculated from the goal alone; on terrain (`even` then
 * holds the even-pace rows), each marker's terrain-split time beside its even-pace time, the timing points (the mats and
 * the finish) in bold, and, on a course with named structures (`features`), the structure each whole mile or km crosses
 * (featureFor). Exported for scripts/verify-tools.cjs, which renders both.
 */
export function Wristband({ rows, goal, pKm, units, overrun, even = null, features = [] }: {
  rows: ReturnType<typeof splitTable>; goal: number; pKm: number; units: UnitSystem; overrun: number; even?: ReturnType<typeof splitTable> | null; features?: TerrainFeature[];
}) {
  const whole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  // The band's whole unit: a mile band's miles, a km band's km (its mats among them); the 5K mats have none.
  const plain = rows.filter((r) => !r.mat && !r.halfway && !r.finish);
  const unit = plain.some((r) => whole(r.km / KM_PER_MILE)) ? KM_PER_MILE : plain.some((r) => whole(r.km)) ? 1 : 0;
  const onRoute = (r: (typeof rows)[number]) => {
    if (!unit || r.finish || r.halfway || !whole(r.km / unit)) return '';
    const n = Math.round(r.km / unit);
    return featureFor(features, (n - 1) * unit, n * unit)?.name ?? '';
  };
  const route = even && unit && features.length ? rows.map(onRoute) : null;
  return (
    <table className="table pace-band-wrist">
      <thead><tr><th scope="col">Marker</th>{even ? <><th scope="col">Terrain</th><th scope="col">Even pace</th>{route ? <th scope="col">On the route</th> : null}</> : <th scope="col">Elapsed</th>}</tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const kind = r.finish ? 'is-finish' : r.mat ? 'is-mat' : r.halfway ? 'is-half' : '';
          const label = r.finish ? 'Finish' : r.halfway ? `Half · ${units === 'mi' ? '13.1 mi' : '21.1 km'}` : r.mat ? matLabel(r.km)
            : whole(r.km / KM_PER_MILE) ? `Mile ${Math.round(r.km / KM_PER_MILE)}` : `Km ${Math.round(r.km)}`;
          return (
            <tr key={r.km} className={kind || undefined}>
              <th scope="row">{label}</th>
              <td>{formatDuration(r.elapsed)}</td>
              {even ? <td>{formatDuration(even[i].elapsed)}</td> : null}
              {route ? <td className="pace-band-wrist-route">{route[i]}</td> : null}
            </tr>
          );
        })}
      </tbody>
      <caption className="sr-only">{even ? `Terrain-split elapsed times for ${fmtGoal(goal)} (published research), beside exact even-pace times` : `Exact even-pace elapsed times for ${fmtGoal(goal)}`}{overrun ? `; a watch reading ${pct(overrun, 1)} long shows ${even ? 'an average of ' : ''}${fmtPace(watchTarget(pKm, overrun), units)}` : ''}</caption>
    </table>
  );
}

/**
 * The band to print, the page's answer: the kicker (goal, course and the band in its mode: terrain splits with their
 * average, or the even pace), on terrain the card line and the climbs, the Splits choice directly above the band it
 * changes (or the one line saying why there are no terrain splits), a live preview of the cut-out strips (the strips
 * themselves for @media print), the one Print button, and the print options folded under it: rows, a watch that reads
 * long, the back strip, the full page and the band as a table. The full page prints that table (`table`) in place of the
 * strips.
 */
function PrintPanel({ goal, pKm, units, rows, interval, overrun, place, genderWord, kicker, line, choice, busy, profile, showBack, onBack, onPrint, waiting, controls, values, optionsOpen = false, mats, terrain, table, paces, pacesOn, paceUnits, onPaces, stretches }: {
  goal: number; pKm: number; units: UnitSystem; rows: ReturnType<typeof splitTable>; interval: SplitInterval; overrun: number; place: string; genderWord: string;
  kicker: string; line: ReactNode; choice: ReactNode; busy: boolean;
  profile: RouteProfile | null; showBack: boolean; onBack: (v: boolean) => void; onPrint: (mode: 'strip' | 'page') => void;
  /** The goal field holds text that is not a goal: printing waits until it is fixed. */
  waiting: boolean; controls: ReactNode; values: ReactNode;
  /** Open the print options on arrival: a link set one of them. */
  optionsOpen?: boolean;
  /** The terrain splits' nine mat times, or null for even pace; `terrain`, the band is the terrain splits. */
  mats: number[] | null; terrain: boolean;
  /** Every marker on the band, for the printed full page. */
  table: ReactNode;
  /** Each stretch's pace on the strips (null when off), the option's state and units, and its tables for the printed full page (null when off). */
  paces: StripPaces | null; pacesOn: boolean; paceUnits: UnitSystem; onPaces: (v: boolean) => void; stretches: ReactNode;
}) {
  return (
    <section className="pace-band-print-panel" id="pace-band-band" aria-labelledby="pace-band-print-title" aria-busy={busy || undefined}>
      {/* The terrain splits carry the Published research badge; even pace none, the visitor's own times (the finishes
          below carry the data badge, and the printed strip names its source either way). */}
      {terrain ? <EvidenceTag kind="research" className="no-print" /> : null}
      <p className="tool-reading-kicker pace-band-kicker" id="pace-band-print-title"><KickerText text={kicker} /></p>
      {line}
      {choice}
      <PaceBandStrip goal={goal} pKm={pKm} units={units} rows={rows} interval={interval} overrun={overrun} place={place} genderWord={genderWord}
        profile={profile} showBack={showBack} waiting={waiting} mats={mats} terrain={terrain} paces={paces} />
      <ShareBar extra={<button type="button" className="btn btn-primary is-compact" data-not-edit disabled={waiting} aria-describedby={waiting ? 'pace-band-print-held' : undefined} onClick={() => onPrint('strip')}>Print wristband strips</button>} />
      {waiting ? <p className="tool-note" id="pace-band-print-held">Fix the goal below to print. The preview still shows {fmtGoal(goal)}.</p> : null}
      {/* One control for the beat: the print options fold into one disclosure (rows, a watch that reads long, the back,
          the whole page instead of the strips). */}
      <details className="tool-more pace-band-options no-print" open={optionsOpen || undefined}>
        <summary>Print options</summary>
        <div className="tool-more-body pace-band-controls">
          {controls}
          <label className="tool-check"><input type="checkbox" checked={pacesOn} onChange={(e) => onPaces(e.target.checked)} /><span>{PACES_LABEL}<small>{pacesUnit(paceUnits)}</small></span></label>
          {profile ? (
            <label className="tool-check"><input type="checkbox" checked={showBack} onChange={(e) => onBack(e.target.checked)} />A route elevation strip for the back ({profile.city})</label>
          ) : null}
          <p className="pace-band-page-print"><button type="button" className="tool-text-button" data-not-edit disabled={waiting} onClick={() => onPrint('page')}>Print the full page instead</button></p>
          {/* Every marker on the band, as a table: with the options, not a third disclosure beside the print button. */}
          {values}
        </div>
      </details>
      {/* The full page prints the band as this table instead of the strips (the fold above is a screen control); on
          terrain its title names the source, as the badge does on screen. */}
      {table ? <div className="print-only pace-band-print-marks"><p className="pace-band-print-marks-title">Every marker on the band{terrain ? ' · terrain splits from published research' : ''}</p>{table}</div> : null}
      {/* With the option on, the full page also prints every stretch's time and pace. */}
      {stretches ? <div className="print-only pace-band-print-stretches"><p className="pace-band-print-marks-title">{stretchesTitle(paceUnits)}{terrain ? ' · terrain splits from published research' : ''}</p>{stretches}</div> : null}
    </section>
  );
}
