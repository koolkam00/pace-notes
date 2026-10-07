'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, EvidencePanel, ShareBar, Stat, Stepper } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { loadInsight } from '@/lib/insights';
import { loadShard, type PaceBandGroup, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { MARATHON_KM, MATS_KM, perUnit, splitTable, watchTarget, type SplitInterval } from '@/lib/tools/pace';
import { formatDuration, formatHM, formatMargin, parseDuration } from '@/lib/tools/time';
import { KM_PER_MILE, elevationLabel, type UnitSystem } from '@/lib/units';
import { SECTION_BOUNDS, count, sectionLabel } from '@/lib/viz/format';

/** Supplied route elevation (every `step` km) for the optional printed back strip. Context only. */
export interface RouteProfile { slug: string; city: string; race: string; km: number; step: number; m: number[]; min: number; max: number; gain: number; loss: number }

const INDEX_PATH = 'tools/pace-band.json';
const GOAL_MIN_S = 90 * 60;
const GOAL_MAX_S = 480 * 60;
const OBS_MIN = 150;
const OBS_MAX = 390;
const CHECKPOINTS = [...MATS_KM, MARATHON_KM];
const HELD = '#2F5BFF';
const SLOW = '#FF5B2E';
const PRESETS = [180, 210, 240, 270, 300];
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
      <span className="pace-band-sub">{finish ? (units === 'mi' ? '26.2 mi' : '42.195 km') : units === 'mi' ? miles(km) : ' '}</span>
    </>
  );
}

type Observed =
  | { state: 'off'; message: string }
  | { state: 'loading' }
  | { state: 'unavailable'; message: string; range: string | null }
  | { state: 'ok'; minute: number; all: Cell; held: Cell | null; slow: Cell | null; lo: number; hi: number };

export default function PaceBand({ indexSha, profiles }: { indexSha: string | null; profiles: RouteProfile[] }) {
  const { units } = useUnits();
  const [q, setQ] = useQueryState(DEFAULTS);

  const parsed = parseDuration(q.goal, 'race');
  const goal = parsed !== null && parsed >= GOAL_MIN_S && parsed <= GOAL_MAX_S ? Math.round(parsed) : null;
  const gender: Gender = q.g === 'men' || q.g === 'women' ? q.g : 'all';
  const interval: SplitInterval = q.split === 'mi' || q.split === 'km' || q.split === '5k' ? q.split : units === 'mi' ? 'mi' : 'km';
  const overrun = [0, 0.5, 1, 1.5].includes(Number(q.watch)) ? Number(q.watch) / 100 : 0;
  const printMode = q.print === 'page' ? 'page' : 'strip';
  const setGoal = (s: number) => setQ({ goal: fmtGoal(clampGoal(s)) });
  const step = (delta: number) => setGoal(Math.round((goal ?? 14400) / 60) * 60 + delta);

  // Verified index, then one verified shard per course × recorded gender.
  const [index, setIndex] = useState<PaceBandIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  useEffect(() => {
    if (!indexSha) return;
    let live = true;
    loadInsight<PaceBandIndex>(INDEX_PATH, indexSha).then((d) => { if (live) setIndex(d); }, () => { if (live) setIndexError(true); });
    return () => { live = false; };
  }, [indexSha]);
  const shardPath = `tools/pace-band/${q.course}/${gender}.json`;
  const [shard, setShard] = useState<{ path: string; data: PaceBandShard | null } | null>(null);
  useEffect(() => {
    if (!index || !index.shards?.[shardPath]) return;
    let live = true;
    loadShard<PaceBandShard>(index, shardPath).then((d) => { if (live) setShard({ path: shardPath, data: d }); }, () => { if (live) setShard({ path: shardPath, data: null }); });
    return () => { live = false; };
  }, [index, shardPath]);

  const scope = index?.scopes.find((s) => s.slug === q.course) ?? null;
  const place = q.course === 'all' ? 'All courses' : scope?.city ?? q.course;
  const where = q.course === 'all' ? 'on all courses' : `in ${place}`;
  const genderWord = gender === 'all' ? '' : gender === 'men' ? 'men' : 'women';
  const minute = goal === null ? null : Math.round(goal / 60);

  const observed: Observed = useMemo(() => {
    if (!indexSha || indexError) return { state: 'off', message: indexSha ? 'The observed data could not be loaded or verified. The even-pace band below still works.' : 'The observed data is not available in this build. The even-pace band still works.' };
    if (!index) return { state: 'loading' };
    if (!scope) return { state: 'unavailable', message: 'That course is not in the data.', range: null };
    const meta = scope.genders[gender];
    if (!meta || !index.shards?.[shardPath]) {
      return { state: 'unavailable', message: `No goal ${where} has 100 finishes recorded as ${genderWord || 'any gender'} in its window, so nothing is published for this selection.`, range: null };
    }
    const range = `Published goals ${where}${genderWord ? ` for ${genderWord}` : ''}: ${formatHM(meta.goals[0] * 60)} to ${formatHM(meta.goals[1] * 60)}${meta.count < meta.goals[1] - meta.goals[0] + 1 ? ', with gaps' : ''}.`;
    if (minute === null) return { state: 'unavailable', message: 'Type a goal to see what finishes at that time ran.', range: null };
    if (minute < OBS_MIN || minute > OBS_MAX) return { state: 'unavailable', message: `Observed groups cover whole-minute goals from ${formatHM(OBS_MIN * 60)} to ${formatHM(OBS_MAX * 60)}. The even-pace band works for any goal from 1:30 to 8:00.`, range: null };
    if (!shard || shard.path !== shardPath) return { state: 'loading' };
    if (!shard.data) return { state: 'off', message: 'This selection could not be loaded or verified. Try again, or choose another course.' };
    const all = cellOf(shard.data.groups.all, minute);
    const windowS = shard.data.window_s || 300;
    const lo = minute * 60 - windowS;
    const hi = minute * 60 - 1;
    if (!all) return { state: 'unavailable', message: `Fewer than 100 finishes ran ${formatDuration(lo, true)} to ${formatDuration(hi, true)} ${where}${genderWord ? ` (recorded as ${genderWord})` : ''}, so this goal is not published.`, range };
    return { state: 'ok', minute, all, held: cellOf(shard.data.groups.held, minute), slow: cellOf(shard.data.groups.slowdown, minute), lo, hi };
  }, [indexSha, indexError, index, scope, gender, shardPath, where, genderWord, minute, shard]);

  const pKm = goal === null ? null : goal / MARATHON_KM;
  const rows = useMemo(() => (goal === null ? [] : splitTable(goal, MARATHON_KM, interval)), [goal, interval]);
  const profile = profiles.find((p) => p.slug === q.course) ?? null;
  const showBack = q.back === '1' && profile !== null;
  const isExample = q.goal === DEFAULTS.goal && q.course === 'all' && gender === 'all';
  const ok = observed.state === 'ok' ? observed : null;
  const gap20 = ok && ok.held && ok.slow ? ok.held.e50[3] - ok.slow.e50[3] : null;

  const printAs = (mode: 'strip' | 'page') => {
    setQ({ print: mode });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const fallbacks = (
    <div className="pace-band-actions">
      {q.course !== 'all' ? <button type="button" className="button-secondary" onClick={() => setQ({ course: 'all' })}>Switch to All courses</button> : null}
      {gender !== 'all' ? <button type="button" className="button-secondary" onClick={() => setQ({ g: 'all' })}>Switch to all genders</button> : null}
    </div>
  );

  return (
    <div className="pace-band-root" data-print={printMode}>
      <div className="tool-workspace">
        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Pace band inputs">
          <h2>Your race</h2>
          {isExample ? <p className="pace-band-example">Example: 4:00, All courses. Change anything; results update as you type.</p> : null}
          <GoalField seconds={goal} onChange={setGoal} onStep={step} />
          <div className="tool-presets" role="group" aria-label="Common goals">
            {PRESETS.map((m) => <button key={m} type="button" aria-pressed={goal === m * 60} onClick={() => setGoal(m * 60)}>{formatHM(m * 60)}</button>)}
          </div>
          <div className="tool-field">
            <label htmlFor="pace-band-course">Course</label>
            <select id="pace-band-course" value={q.course} onChange={(e) => setQ({ course: e.target.value })}>
              <option value="all">All courses{index ? ` · ${editions(index.scopes.find((s) => s.slug === 'all')?.editions ?? 0)}` : ''}</option>
              {index ? index.scopes.filter((s) => s.slug !== 'all').map((s) => <option key={s.slug} value={s.slug}>{s.city ?? s.slug} · {editions(s.editions)}</option>)
                : q.course !== 'all' ? <option value={q.course}>{q.course}</option> : null}
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
            <p className="tool-empty">Type a goal between 1:30 and 8:00 (for example 3:30) to build your band.</p>
          ) : (
            <>
              <div className="tool-headline pace-band-headline" aria-live="polite">
                <Stat label="Even pace" value={formatDuration(perUnit(pKm, units))} sub={`per ${units === 'mi' ? 'mile' : 'km'} · ${fmtPace(pKm, units === 'mi' ? 'km' : 'mi')}${overrun ? ` · watch ${fmtPace(watchTarget(pKm, overrun), units)}` : ''}`} />
                {gap20 !== null && ok ? (
                  <Stat label="20 km gap" value={formatDuration(Math.abs(gap20))}
                    sub={`${gap20 >= 0 ? 'earlier' : 'later'} for finishes with a sustained slowdown than for those that held pace`} />
                ) : (
                  <Stat label="Even pace at 20 km" value={formatDuration(pKm * 20)} sub={`${miles(20)} · arithmetic`} />
                )}
                {ok && ok.all.sd !== undefined ? (
                  <Stat label="Sustained slowdown" value={pct(ok.all.sd)} sub={`observed share of ${count(ok.all.n)} complete finishes in the window`} />
                ) : (
                  <Stat label="Finish" value={formatDuration(goal, true)} sub="even-pace goal" />
                )}
                {gap20 !== null && ok && ok.held && ok.slow ? (
                  <p className="pace-band-headline-note">
                    Same finish window ({formatDuration(ok.lo, true)}–{formatDuration(ok.hi, true)}, {where}), different races: finishes that later had a sustained slowdown passed
                    20 km in a median <b>{formatDuration(ok.slow.e50[3])}</b>, {formatDuration(Math.abs(gap20))} {gap20 >= 0 ? 'earlier' : 'later'} than those that held pace (<b>{formatDuration(ok.held.e50[3])}</b>). Even pace for {fmtGoal(goal)} is {formatDuration(pKm * 20)}.
                  </p>
                ) : null}
              </div>

              <div className="pace-band-layout">
                <div className="pace-band-col is-band">
                  <EvidencePanel kind="arithmetic" title="Your even-pace band" id="pace-band-band"
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
                      <p className="tool-note">Most watches read a certified course a little long, so their pace runs quick. Pick an overrun above to see the watch pace that matches this band.</p>
                    )}
                  </EvidencePanel>
                </div>

                <div className="pace-band-col is-data">
                  <EvidencePanel kind="data" id="pace-band-observed"
                    title={ok ? <>Finishes that ran {formatDuration(ok.lo, true)} to {formatDuration(ok.hi, true)} {where}</> : <>What finishes at {fmtGoal(goal)} ran {where}</>}
                    meta={ok ? <>Achieved finishes, not stated goals{genderWord ? `, recorded as ${genderWord}` : ''}: every one beat {formatHM(ok.minute * 60)} by 0:01 to 5:00. Observed, not a recommended plan.{goal % 60 ? ` Your goal has seconds, so the window uses ${formatHM(ok.minute * 60)}.` : ''}</> : undefined}>
                    {observed.state === 'loading' ? <p className="tool-state" aria-live="polite">Loading the observed finishes…</p> : null}
                    {observed.state === 'off' ? <p className="tool-state is-error" role="alert">{observed.message}</p> : null}
                    {observed.state === 'unavailable' ? (
                      <div className="pace-band-unavailable" role="status">
                        <p><strong>Not published for this selection.</strong> {observed.message}</p>
                        {observed.range ? <p>{observed.range}</p> : null}
                        {q.course !== 'all' || gender !== 'all' ? <p>You can switch the observed columns to a wider group; the band itself does not change.</p> : null}
                        {fallbacks}
                      </div>
                    ) : null}
                    {ok ? <ObservedTable cells={ok} goal={goal} pKm={pKm} units={units} onFallback={fallbacks} /> : null}
                  </EvidencePanel>

                  {ok && (ok.held || ok.slow) ? (
                    <EvidencePanel kind="data" title="Section pace: held pace vs sustained slowdown" id="pace-band-chart"
                      meta={`Median pace in each section with the middle half of finishes (25th–75th percentile) shaded, against even pace for ${fmtGoal(goal)}. The shading is observed variation between finishes, not uncertainty.`}>
                      <SectionChart held={ok.held} slow={ok.slow} pKm={pKm} units={units} />
                    </EvidencePanel>
                  ) : null}

                  {ok && ok.all.onset && ok.slow ? <OnsetPanel all={ok.all} slow={ok.slow} units={units} where={where} /> : null}
                </div>
              </div>

              <PrintPanel goal={goal} pKm={pKm} units={units} rows={rows} interval={interval} overrun={overrun} place={place} genderWord={genderWord}
                observed={ok} profile={profile} showBack={showBack} onBack={(v) => setQ({ back: v ? '1' : '0' })} onPrint={printAs} />

              <div className="print-only pace-band-print-notes">
                <p>Pace Notes pace band. The band is even-pace arithmetic. Observed columns are achieved finishes from Pace Notes data (complete finishes only; counts are finishes, not people), grouped by whether they had a sustained slowdown: a 5 km section after 20 km at least 25% slower than the 5–20 km pace, contiguous sections totalling at least 5 km (doi:10.1371/journal.pone.0251513). Descriptive, not a plan, and not a cause.</p>
              </div>

              <div className="tool-callout no-print">
                <strong>Keep going.</strong> See the just-made vs just-missed contrast in <Link href="/analyses/where-time-is-gained">where time is gained</Link>, how openings play out in <Link href="/analyses/starting-pace">starting pace</Link>, the same goal on other courses in the <Link href="/tools/course-chooser">course chooser</Link>, and live finish ranges on race day with the <Link href="/tools/projector">race-day projector</Link>.
              </div>
              <ShareBar print={false} />

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

/** Goal input in h:mm with −/+ one-minute steppers. Keeps the visitor's text while they type. */
function GoalField({ seconds, onChange, onStep }: { seconds: number | null; onChange: (s: number) => void; onStep: (delta: number) => void }) {
  const id = useId();
  const [text, setText] = useState(seconds === null ? '' : fmtGoal(seconds));
  const [touched, setTouched] = useState(false);
  const last = useRef(seconds);
  useEffect(() => {
    if (seconds !== last.current) {
      last.current = seconds;
      const typed = parseDuration(text, 'race');
      if (seconds !== null && (typed === null || Math.round(typed) !== seconds)) setText(fmtGoal(seconds));
    }
  }, [seconds, text]);
  const parsed = text.trim() ? parseDuration(text, 'race') : null;
  const problem = !text.trim() ? 'Type a goal, such as 3:30.' : parsed === null ? 'Try 3:30, 3:30:00 or 210 (minutes).'
    : parsed < GOAL_MIN_S || parsed > GOAL_MAX_S ? 'Goals from 1:30 to 8:00.' : null;
  const show = touched && problem !== null;
  return (
    <div className="tool-field is-large pace-band-goal">
      <label htmlFor={id}>Goal finish time</label>
      <Stepper label="Goal" onStep={onStep}>
        <input id={id} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="4:00" value={text}
          aria-invalid={show || undefined} aria-describedby={`${id}-hint`}
          onChange={(e) => {
            setText(e.target.value);
            const next = parseDuration(e.target.value, 'race');
            if (next !== null && next >= GOAL_MIN_S && next <= GOAL_MAX_S) { last.current = Math.round(next); onChange(Math.round(next)); }
          }}
          onBlur={() => { setTouched(true); if (parsed !== null && !problem) setText(fmtGoal(parsed)); }} />
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
function ObservedTable({ cells, goal, pKm, units, onFallback }: { cells: Extract<Observed, { state: 'ok' }>; goal: number; pKm: number; units: UnitSystem; onFallback: ReactNode }) {
  const [view, setView] = useState<'split' | 'all'>('split');
  const { all, held, slow } = cells;
  const even = (i: number) => (i === 8 ? goal : pKm * CHECKPOINTS[i]);
  const delta = (v: number, i: number) => <span className="pace-band-delta">{formatMargin(v - even(i))}</span>;
  const missing = [!held ? 'held pace' : null, !slow ? 'sustained slowdown' : null].filter(Boolean);
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
                <th scope="col">Even pace</th>
                <th scope="col"><i className="pace-band-key" style={{ background: HELD }} aria-hidden="true" />Held pace</th>
                <th scope="col"><i className="pace-band-key" style={{ background: SLOW }} aria-hidden="true" />Sustained slowdown</th>
              </tr>
            </thead>
            <tbody>
              {CHECKPOINTS.map((km, i) => (
                <tr key={km} className={i === 8 ? 'is-finish' : i === 3 ? 'is-key' : undefined}>
                  <th scope="row"><MatName km={km} units={units} /></th>
                  <td>{formatDuration(even(i))}</td>
                  <td>{held ? <>{formatDuration(held.e50[i])}{delta(held.e50[i], i)}</> : '—'}</td>
                  <td>{slow ? <>{formatDuration(slow.e50[i])}{delta(slow.e50[i], i)}</> : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">Finishes</th><td /><td>{held ? count(held.n) : '—'}</td><td>{slow ? count(slow.n) : '—'}</td></tr>
              <tr><th scope="row">Editions</th><td /><td>{held ? editions(held.ed) : '—'}</td><td>{slow ? editions(slow.ed) : '—'}</td></tr>
            </tfoot>
            <caption>
              Median elapsed time of each group at the official mats (20 km is the 20 km mat, not halfway). The smaller line is the median minus even pace for {fmtGoal(goal)}; every finish here beat the goal, so medians run a little ahead.
              {missing.length ? ` Fewer than 100 finishes in the ${missing.join(' and ')} group, so it is not shown.` : ''}
            </caption>
          </table>
        ) : (
          <table className="tool-table pace-band-table">
            <thead><tr><th scope="col">Mat</th><th scope="col">25th pct</th><th scope="col">Median</th><th scope="col">75th pct</th></tr></thead>
            <tbody>
              {CHECKPOINTS.map((km, i) => (
                <tr key={km} className={i === 8 ? 'is-finish' : i === 3 ? 'is-key' : undefined}>
                  <th scope="row"><MatName km={km} units={units} /></th>
                  <td>{all.e25 ? formatDuration(all.e25[i]) : '—'}</td>
                  <td>{formatDuration(all.e50[i])}{delta(all.e50[i], i)}</td>
                  <td>{all.e75 ? formatDuration(all.e75[i]) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">Finishes</th><td /><td>{count(all.n)}</td><td /></tr>
              <tr><th scope="row">Editions</th><td /><td>{editions(all.ed)}</td><td /></tr>
            </tfoot>
            <caption>All finishes in the window, held and slowed together. A quarter passed each mat sooner than the 25th percentile and a quarter later than the 75th: observed spread, not uncertainty. The smaller line is the median minus even pace for {fmtGoal(goal)}.</caption>
          </table>
        )}
      </div>
      {missing.length && view === 'split' ? <div className="no-print">{onFallback}</div> : null}
    </>
  );
}

/** Median section pace with interquartile bands for the held and slowdown groups, against even pace. Hand-built SVG. */
function SectionChart({ held, slow, pKm, units }: { held: Cell | null; slow: Cell | null; pKm: number; units: UnitSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 520);
  const [hover, setHover] = useState<number | null>(null);
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
  // Direct labels in the 5–10 km section: the faster group above its line, the other below.
  const labelAt = 1;
  const order = [...series].sort((a, b) => a.c.s50[labelAt] - b.c.s50[labelAt]);
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
        {series.map((s) => <span key={s.key}><i style={{ background: s.colour }} />{s.name} median, middle half shaded</span>)}
        <span><i className="dashed" />Even pace {fmtPace(pKm, units)}</span>
      </div>
      <div ref={ref} className="viz pace-band-chart" onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img"
          aria-label={`Median pace in each of nine sections. ${series.map(describe).join(' ')} Even pace is ${fmtPace(pKm, units)}.`}>
          <rect x={x(20)} y={m.t} width={x(MARATHON_KM) - x(20)} height={ih} fill="var(--paper-2)" opacity={0.6} />
          <text x={x(20) + 6} y={m.t - 8} className="annotation-sub">after 20 km: where a sustained slowdown can start</text>
          {ticks.map((v) => (
            <g key={v} className="grid">
              <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{formatDuration(v)}</text>
            </g>
          ))}
          <text x={4} y={m.t - 8} className="axis-label">/{units} · faster ↑</text>
          {xTicks.map((km) => <text key={km} x={x(km)} y={H - 12} textAnchor="middle">{units === 'mi' ? miles(km).replace(' mi', '') : km}</text>)}
          <text x={width - m.r} y={H - 12} textAnchor="end" className="axis-label">{units === 'mi' ? 'mi' : 'km'}</text>
          {series.map((s) => (s.c.s25 && s.c.s75 ? <path key={`${s.key}-band`} d={area(s.c.s25, s.c.s75)} fill={s.colour} opacity={0.14} /> : null))}
          <line x1={m.l} x2={width - m.r} y1={evenY} y2={evenY} stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="5 4" />
          {series.map((s) => (
            <g key={s.key}>
              <path d={line(s.c.s50)} fill="none" stroke={s.colour} strokeWidth={2.4} strokeLinejoin="round" />
              {s.c.s50.map((v, i) => <circle key={i} cx={x(mids[i])} cy={y(toU(v))} r={hover === i ? 5 : 3.5} fill={s.colour} stroke="var(--card)" strokeWidth={2} />)}
            </g>
          ))}
          {order.map((s, k) => {
            const yy = y(toU(s.c.s50[labelAt]));
            const above = k === 0;
            return <text key={s.key} className="annotation pace-band-halo" x={x(mids[labelAt]) - 8} y={above ? yy - 12 : yy + 22}>{s.name}</text>;
          })}
          <text className="annotation-sub pace-band-halo" x={width - m.r - 2} y={evenY - 7} textAnchor="end">even pace</text>
          {hover !== null ? <line x1={x(mids[hover])} x2={x(mids[hover])} y1={m.t} y2={m.t + ih} stroke="var(--ink-3)" strokeWidth={1} /> : null}
        </svg>
        {hover !== null ? (
          <div className="viz-tooltip pace-band-tip" style={{ left: tipX, top: m.t + 4 }} aria-hidden="true">
            <b>{sectionLabel(hover, units)}</b>
            {series.map((s) => (
              <span key={s.key}><i style={{ background: s.colour }} />{s.name}: {formatDuration(toU(s.c.s50[hover]))}{s.c.s25 && s.c.s75 ? ` (${formatDuration(toU(s.c.s25[hover]))}–${formatDuration(toU(s.c.s75[hover]))})` : ''}</span>
            ))}
            <span>Even pace: {formatDuration(toU(pKm))}</span>
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
                    <td key={s.key}>{formatDuration(toU(s.c.s50[i]))}{s.c.s25 && s.c.s75 ? <span className="pace-band-delta">{formatDuration(toU(s.c.s25[i]))}–{formatDuration(toU(s.c.s75[i]))}</span> : null}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <caption>Median pace per {units === 'mi' ? 'mile' : 'km'} in each section, with the 25th–75th percentile range below. Even pace: {fmtPace(pKm, units)}.</caption>
          </table>
        </div>
      </details>
    </>
  );
}

/** Share of the window with a sustained slowdown, and the section where it began. */
function OnsetPanel({ all, slow, units, where }: { all: Cell; slow: Cell; units: UnitSystem; where: string }) {
  const onset = all.onset ?? [];
  const total = onset.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...onset, 1);
  return (
    <EvidencePanel kind="data" title="Where the sustained slowdowns began" id="pace-band-onset"
      meta={`${count(slow.n)} of ${count(all.n)} complete finishes in this window ${where} had a sustained slowdown (${pct(all.sd ?? slow.n / all.n)}). The section where it started:`}>
      <ol className="pace-band-onset">
        {onset.map((c, i) => (
          <li key={i}>
            <span className="pace-band-onset-label">{sectionLabel(4 + i, units)}</span>
            <span className="pace-band-onset-bar" aria-hidden="true"><i style={{ width: `${(c / max) * 100}%` }} /></span>
            <span className="pace-band-onset-value">{count(c)} <small>{pct(c / total, 0)}</small></span>
          </li>
        ))}
      </ol>
      <p className="tool-note">
        <strong>Sustained slowdown</strong> means a 5 km section after 20 km at least 25% slower than the runner’s own 5–20 km pace, with contiguous slow sections totalling at least 5 km (published definition, <a href="https://doi.org/10.1371/journal.pone.0251513" rel="noopener noreferrer">doi:10.1371/journal.pone.0251513</a>). These are observed shares of complete finishes, not anyone’s chance: runners who stopped are not in the data.
      </p>
    </EvidencePanel>
  );
}

/** Print options, a live preview of the cut-out strips, and the strips themselves for @media print. */
function PrintPanel({ goal, pKm, units, rows, interval, overrun, place, genderWord, observed, profile, showBack, onBack, onPrint }: {
  goal: number; pKm: number; units: UnitSystem; rows: ReturnType<typeof splitTable>; interval: SplitInterval; overrun: number; place: string; genderWord: string;
  observed: Extract<Observed, { state: 'ok' }> | null; profile: RouteProfile | null; showBack: boolean; onBack: (v: boolean) => void; onPrint: (mode: 'strip' | 'page') => void;
}) {
  const held = observed?.held ?? null;
  // Split strips repeat every mile or km, plus halfway; the mat strip carries the 5 km mats and the finish.
  const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  const splitCells = interval === '5k' ? [] : rows.filter((r) => !r.finish && (r.halfway || isWhole(interval === 'mi' ? r.km / KM_PER_MILE : r.km)));
  const perStrip = splitCells.length ? Math.ceil(splitCells.length / Math.ceil(splitCells.length / 12)) : 0;
  const strips: (typeof splitCells)[] = [];
  for (let i = 0; i < splitCells.length; i += perStrip) strips.push(splitCells.slice(i, i + perStrip));
  const caption = held && observed
    ? `H = held-pace median of ${count(held.n)} finishes ${formatDuration(observed.lo, true)}–${formatDuration(observed.hi, true)}, ${place}${genderWord ? `, ${genderWord}` : ''}, no sustained slowdown (Pace Notes data; observed, not a plan). Big numbers: even-pace arithmetic.`
    : 'Even-pace arithmetic. No observed held-pace group is published for this selection.';
  return (
    <section className="tool-panel pace-band-print-panel" aria-labelledby="pace-band-print-title">
      <header className="tool-panel-head">
        <span className="tool-badges"><span className="evidence-badge evidence-arithmetic">Arithmetic</span>{held ? <span className="evidence-badge evidence-data">Pace Notes data</span> : null}</span>
        <h2 className="tool-panel-title" id="pace-band-print-title">Print your wristband</h2>
        <p className="tool-panel-meta">Strips about 2.5 cm wide, with dashed cut guides. Big numbers are even-pace elapsed times; the small “H” line is the held-pace median at each mat. Print at 100% scale.</p>
      </header>
      <div className="pace-band-print-controls no-print">
        <button type="button" className="button-primary" onClick={() => onPrint('strip')}>Print wristband strips</button>
        <button type="button" className="button-secondary" onClick={() => onPrint('page')}>Print full page</button>
        {profile ? (
          <label className="tool-check"><input type="checkbox" checked={showBack} onChange={(e) => onBack(e.target.checked)} />Add a route elevation strip for the back ({profile.city})</label>
        ) : null}
      </div>
      <div className="pace-band-sheet-wrap" tabIndex={0} role="region" aria-label="Preview of the printed strips (scrolls sideways)">
        <div className="pace-band-sheet">
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
    </section>
  );
}

/** Supplied route elevation as a strip for the back of the band. Context only; never used in a calculation. */
function ElevationStrip({ profile, units }: { profile: RouteProfile; units: UnitSystem }) {
  const W = 700;
  const H = 62;
  const top = 6;
  const pts = profile.m;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const range = Math.max(hi - lo, 20);
  const x = (km: number) => (km / profile.km) * W;
  const y = (v: number) => top + (1 - (v - lo) / range) * (H - top - 4);
  const path = `M0 ${H} ${pts.map((v, i) => `L${x(Math.min(i * profile.step, profile.km)).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} L${W} ${H} Z`;
  return (
    <div className="pace-band-strip is-back">
      <svg viewBox={`0 0 ${W} ${H + 12}`} preserveAspectRatio="none" role="img"
        aria-label={`Supplied route elevation for ${profile.city}, from ${elevationLabel(profile.min, units)} to ${elevationLabel(profile.max, units)}.`}>
        <path d={path} fill="#D9D2C3" stroke="#15171C" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {[5, 10, 15, 20, 25, 30, 35, 40].filter((km) => km < profile.km).map((km) => (
          <g key={km}>
            <line x1={x(km)} x2={x(km)} y1={top} y2={H} stroke="#15171C" strokeWidth={0.6} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <text x={x(km)} y={H + 10} textAnchor="middle" fontSize="8.5" fontFamily="var(--mono)">{km}K</text>
          </g>
        ))}
      </svg>
      <p className="pace-band-strip-caption">Back · {profile.race} route elevation, {elevationLabel(profile.min, units)} to {elevationLabel(profile.max, units)} · supplied current route; historical validity unknown; bridge decks may be missing · context only, not used in any time</p>
    </div>
  );
}

