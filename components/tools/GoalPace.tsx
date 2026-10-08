'use client';

import type { ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { EvidencePanel, Stat } from '@/components/tools/ui';
import { HALF_KM, MARATHON_KM, MATS_KM, perUnit, splitTable } from '@/lib/tools/pace';
import { GOAL_PAGE_MINUTES, courseChooserHref, evenAt, goalLabel, goalPagePath, paceBandHref } from '@/lib/tools/pace-chart';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

/** What recorded finishes in the five minutes under the goal ran (pace-band data family, all courses, all recorded genders). */
export interface GoalObserved {
  /** The window, in seconds: goal − 5:00 to goal − 0:01. */
  lo: number;
  hi: number;
  n: number;
  editions: number;
  /** Median and 25th/75th percentile elapsed seconds at the 5–40 km mats and the finish (nine values). */
  e50: number[];
  e25: number[] | null;
  e75: number[] | null;
  /** Observed share of the window's finishes with a sustained slowdown, as published. */
  sd: number | null;
  held: { n: number; e50: number[] } | null;
  slow: { n: number; e50: number[] } | null;
}

/** Finishes in the minute before and after the goal mark (finish-times family), with the smooth-curve expectation. */
export interface GoalBunching { before: number; after: number; expected: number; ratio: number; ci: [number, number] }

const CHECKPOINTS = [...MATS_KM, MARATHON_KM];
const count = (n: number) => Math.round(n).toLocaleString('en-US');
const clock = (s: number) => formatDuration(s, true);
/** Elapsed time at a mat: m:ss under an hour, h:mm:ss after, as in the pace charts. */
const elapsed = (s: number) => formatDuration(s, Math.round(s) >= 3600);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const paceText = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;
const unitWord = (units: UnitSystem) => (units === 'mi' ? 'mile' : 'km');
const other = (units: UnitSystem): UnitSystem => (units === 'mi' ? 'km' : 'mi');

/** "5 km" with the mile equivalent beneath when the visitor reads miles; the timing mats themselves are metric. */
function PointName({ km, units, halfway = false }: { km: number; units: UnitSystem; halfway?: boolean }) {
  const finish = Math.abs(km - MARATHON_KM) < 1e-6;
  const name = finish ? 'Finish' : halfway ? 'Halfway' : `${km} km`;
  const sub = finish || halfway ? (units === 'mi' ? `${(km / KM_PER_MILE).toFixed(1)} mi` : `${km.toFixed(1)} km`) : units === 'mi' ? `${(km / KM_PER_MILE).toFixed(1)} mi` : null;
  return <>{name}{sub ? <span className="goal-chart-sub">{sub}</span> : null}</>;
}

/** The dek under the H1: the even pace in the visitor's units, and the size of the observed window. */
export function GoalPaceDek({ goal, observed }: { goal: number; observed: GoalObserved | null }) {
  const { units } = useUnits();
  const seconds = goal * 60;
  const pKm = seconds / MARATHON_KM;
  return (
    <p className="tool-dek">
      A {goalLabel(goal)} marathon at even pace is {formatDuration(perUnit(pKm, units))} per {unitWord(units)} ({formatDuration(perUnit(pKm, other(units)))} per {unitWord(other(units))}), with halfway at {clock(seconds / 2)}.
      {observed ? <> Below, those calculated splits sit beside what {count(observed.n)} recorded finishes from {clock(observed.lo)} to {clock(observed.hi)} actually ran at each 5 km mat.</> : null}
    </p>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`tool-table-wrap${className ? ` ${className}` : ''}`}>{children}</div>;
}

/** Everything below the header of a goal page. Static HTML in miles; redrawn in km once the units preference is read. */
export function GoalPaceBody({ goal, observed, bunching }: { goal: number; observed: GoalObserved | null; bunching: GoalBunching | null }) {
  const { units } = useUnits();
  const label = goalLabel(goal);
  const seconds = goal * 60;
  const pKm = seconds / MARATHON_KM;
  const even = [...MATS_KM.slice(0, 4).map((km) => ({ km, halfway: false })), { km: HALF_KM, halfway: true }, ...MATS_KM.slice(4).map((km) => ({ km, halfway: false })), { km: MARATHON_KM, halfway: false }];
  const fine = splitTable(seconds, MARATHON_KM, units === 'mi' ? 'mi' : 'km');
  const span = observed ? `${clock(observed.lo)} to ${clock(observed.hi)}` : null;
  const minuteBefore = `${clock(seconds - 60)} and ${clock(seconds - 1)}`;

  return (
    <>
      <div className="tool-headline goal-pace-headline">
        <Stat label={`Even pace per ${unitWord(units)}`} value={formatDuration(perUnit(pKm, units))} sub={`${paceText(pKm, other(units))} · calculated from the goal`} />
        <Stat label="Halfway at even pace" value={clock(seconds / 2)} sub="Calculated, not a recorded split" />
        {observed?.sd != null ? (
          <Stat label={<>Sustained slowdown <span className="goal-pace-src">Pace Notes data</span></>} value={pct(observed.sd)}
            sub={`of ${count(observed.n)} finishes from ${span}, all courses`} />
        ) : null}
      </div>

      <div className="goal-pace-pair">
        <EvidencePanel id="goal-pace-even" title={`Even-pace splits for ${label}`}
          meta={`Calculated from the goal, not recorded: ${paceText(pKm, units)} (${paceText(pKm, other(units))}) for every step, so each 5 km takes ${formatDuration(pKm * 5)}.`}>
          <Panel>
            <table className="tool-table goal-pace-table">
              <caption>Elapsed time at an even pace for a {label} marathon, calculated. Halfway is 21.0975 km; the data records no halfway time.</caption>
              <thead><tr><th scope="col">Point</th><th scope="col">Even pace</th></tr></thead>
              <tbody>
                {even.map((p) => (
                  <tr key={p.km} className={p.halfway ? 'is-key' : p.km === MARATHON_KM ? 'is-finish' : undefined}>
                    <th scope="row"><PointName km={p.km} units={units} halfway={p.halfway} /></th>
                    <td>{elapsed(evenAt(seconds, MARATHON_KM, p.km))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </EvidencePanel>

        {observed ? (
          <EvidencePanel kind="data" id="goal-pace-observed" title={`What ${count(observed.n)} finishes from ${span} ran`}
            meta={<>All courses, {count(observed.editions)} race editions. Achieved finishes, not stated goals: each beat {label} by 0:01 to {formatDuration(seconds - observed.lo)} and has all nine 5 km mat times. Median and middle half (25th to 75th percentile) of the elapsed time at each mat. Observed, not a recommended plan.</>}>
            <Panel>
              <table className="tool-table goal-pace-table goal-pace-observed">
                <caption>Recorded elapsed times at each 5 km mat and the finish for finishes from {span}. The source records no halfway or mile splits.</caption>
                <thead><tr><th scope="col">Mat</th><th scope="col">Median</th><th scope="col">Middle half</th></tr></thead>
                <tbody>
                  {even.map((p) => {
                    if (p.halfway) return <tr key={p.km} className="is-key goal-pace-none"><th scope="row"><PointName km={p.km} units={units} halfway /></th><td colSpan={2}>No halfway time in the data</td></tr>;
                    const i = CHECKPOINTS.indexOf(p.km);
                    return (
                      <tr key={p.km} className={p.km === MARATHON_KM ? 'is-finish' : undefined}>
                        <th scope="row"><PointName km={p.km} units={units} /></th>
                        <td>{elapsed(observed.e50[i])}</td>
                        <td className="goal-pace-range">{observed.e25 && observed.e75 ? <>{elapsed(observed.e25[i])}<span aria-hidden="true">–</span><span className="sr-only"> to </span>{elapsed(observed.e75[i])}</> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </EvidencePanel>
        ) : (
          <EvidencePanel kind="data" title={`What finishes at ${label} ran`}>
            <p className="tool-state">The observed mat times are not available in this build. The even-pace splits still apply.</p>
          </EvidencePanel>
        )}
      </div>

      {observed?.held && observed.slow && observed.sd != null ? (
        <EvidencePanel kind="data" id="goal-pace-slowdown" title="Held pace or sustained slowdown"
          meta={`The same ${count(observed.n)} finishes from ${span}, split by how their race ended. Median elapsed time at each mat.`}>
          <div className="goal-pace-split">
            <p className="goal-pace-lead">
              <b>{pct(observed.sd)}</b> of these finishes had a sustained slowdown ({count(observed.slow.n)} finishes); the other {count(observed.held.n)} held pace.
            </p>
            <Panel className="goal-pace-split-table">
              <table className="tool-table goal-pace-table">
                <caption>Median recorded elapsed time at each mat for finishes from {span} that held pace and that had a sustained slowdown. Observed, not a plan.</caption>
                <thead><tr><th scope="col">Mat</th><th scope="col">Held pace</th><th scope="col">Sustained slowdown</th></tr></thead>
                <tbody>
                  {CHECKPOINTS.map((km, i) => (
                    <tr key={km} className={km === MARATHON_KM ? 'is-finish' : undefined}>
                      <th scope="row"><PointName km={km} units={units} /></th>
                      <td>{elapsed(observed.held!.e50[i])}</td>
                      <td>{elapsed(observed.slow!.e50[i])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <p className="tool-note goal-pace-split-note">
              {SLOWDOWN_DEFINITION} It follows the <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">published slowdown method (doi:10.1371/journal.pone.0251513)</a>.
              The groups are selected by how the race ended, so comparing them describes what those races looked like, not what a different first half would have done.
            </p>
          </div>
        </EvidencePanel>
      ) : null}

      {bunching ? (
        <EvidencePanel kind="data" id="goal-pace-bunching" title={`Finish times bunch just under ${label}`}
          meta={`From the finish-time data behind the 3:59 effect story. The smooth curve is fitted to the minutes around ${label}; its ratio's 95% interval, resampling whole race editions, is ${bunching.ci[0].toFixed(2)} to ${bunching.ci[1].toFixed(2)}.`}>
          <p>
            {count(bunching.before)} finishes landed between {minuteBefore}, {bunching.ratio.toFixed(2)} times the {count(bunching.expected)} a smooth curve expects there, and {count(bunching.after)} landed in the next minute.
            {' '}<Link href="/stories/round-numbers">Read the 3:59 effect story</Link>.
          </p>
        </EvidencePanel>
      ) : null}

      <div className="no-print">
        <EvidencePanel id="goal-pace-every" title={`Every ${unitWord(units)} at even pace`}
          meta={`Calculated from the goal, not recorded. Timing mats and halfway are marked.`}>
          <details className="goal-pace-details">
            <summary>Show all {fine.length} rows: every {unitWord(units)}, the 5 km mats, halfway and the finish</summary>
            <Panel>
              <table className="tool-table">
                <caption>Elapsed time at an even pace for a {label} marathon, every {unitWord(units)}. Halfway and mile rows are calculated, not recorded splits.</caption>
                <thead><tr><th scope="col">Split</th><th scope="col">Elapsed</th></tr></thead>
                <tbody>
                  {fine.map((r) => (
                    <tr key={r.km} className={r.finish ? 'is-finish' : r.mat ? 'is-mat' : r.halfway ? 'is-key' : undefined}>
                      <td>{r.finish ? 'Finish' : r.halfway ? 'Halfway' : r.mat && units === 'mi' ? `${r.km} km mat` : units === 'mi' ? `${Math.round(r.km / KM_PER_MILE)} mi` : `${Math.round(r.km)} km${r.mat ? ' mat' : ''}`}</td>
                      <td>{elapsed(r.elapsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </details>
        </EvidencePanel>
      </div>

      <div className="tool-callout goal-pace-next no-print">
        <strong>Planning a {label} marathon?</strong>{' '}
        Print the <Link href={paceBandHref(goal)}>pace band for {label}</Link>, with the observed columns for your course; compare courses at this pace in the <Link href={courseChooserHref(goal)}>course chooser</Link>;
        or find another goal in the <Link href="/tools/marathon-pace-chart">marathon pace chart</Link>.
      </div>

      <nav className="goal-chart-goals no-print" aria-labelledby="goal-pace-others">
        <h2 id="goal-pace-others">Other goals</h2>
        <ul>
          {GOAL_PAGE_MINUTES.map((m) => (
            <li key={m}>
              {m === goal
                ? <span aria-current="page"><b>{goalLabel(m)}</b><span>this page</span></span>
                : <Link href={goalPagePath(m)}><b>{goalLabel(m)}</b><span>marathon pace</span></Link>}
            </li>
          ))}
          <li><Link href="/tools/marathon-pace-chart"><b>All goals</b><span>Marathon pace chart</span></Link></li>
        </ul>
      </nav>
    </>
  );
}
