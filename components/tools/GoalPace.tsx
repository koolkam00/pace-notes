'use client';

import type { ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { EvidenceTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import { ToolHandoffs } from '@/components/tools/Handoffs';
import MatLines from '@/components/tools/MatLines';
import Values from '@/components/ui/Values';
import { evenPaceGapText, groupGapText, type GoalPeer } from '@/lib/tools/goal-facts';
import { MARATHON_KM, MATS_KM, perUnit, splitTable } from '@/lib/tools/pace';
import { evenAt, goalLabel, paceBandHref } from '@/lib/tools/pace-chart';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

/** What recorded finishes in the five minutes under the goal ran (pace-band data family, all courses, all recorded genders). */
export interface GoalObserved {
  /** The window, in seconds: goal − 5:00 to goal − 0:01. */
  lo: number;
  hi: number;
  n: number;
  editions: number;
  /** Race editions in the whole pace-band cohort (the index's count). */
  totalEditions: number | null;
  /** Median and 25th/75th percentile elapsed seconds at the 5–40 km mats and the finish (nine values). */
  e50: number[];
  e25: number[] | null;
  e75: number[] | null;
  /** Median pace of each of the nine sections (start–5 km … 40 km–finish), whole seconds per km, as published. */
  s50: number[] | null;
  /** Observed share of the window's finishes with a sustained slowdown, as published. */
  sd: number | null;
  /** Finishes whose sustained slowdown began in each onset section, and the sections' start points in km (20, 25, 30, 35). */
  onset: number[] | null;
  onsetKm: number[] | null;
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
const pct = (v: number) => `${Math.round(v * 100)}%`;
const paceText = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;
const unitWord = (units: UnitSystem) => (units === 'mi' ? 'mile' : 'km');
const other = (units: UnitSystem): UnitSystem => (units === 'mi' ? 'km' : 'mi');

/** The dek under the H1 (ToolPageHeader wraps it): what the page sets the even-pace splits beside. Its numbers are on the night card below. */
export function GoalPaceDek({ goal, observed }: { goal: number; observed: GoalObserved | null }) {
  const label = goalLabel(goal);
  return <>The even-pace splits for a {label} marathon{observed ? <>, beside what {count(observed.n)} finishes just under {label} actually ran</> : null}.</>;
}

/** A gap against a reference, negative = ahead: "2:07 ahead of", "level with", "0:40 behind". */
const against = (gap: number) => (Math.abs(gap) < 0.5 ? 'level with' : `${formatDuration(Math.abs(gap))} ${gap < 0 ? 'ahead of' : 'behind'}`);
/** A finish against another: "0:06 faster", "level with them", "1:12 slower". */
const finished = (gap: number) => (Math.abs(gap) < 0.5 ? 'level with them' : `${formatDuration(Math.abs(gap))} ${gap < 0 ? 'faster' : 'slower'}`);

/** Everything below the header of a goal page. Static HTML in miles; redrawn in km once the units preference is read. */
export function GoalPaceBody({ goal, observed, bunching, pileup }: { goal: number; observed: GoalObserved | null; bunching: GoalBunching | null; peers?: GoalPeer[];
  /** The pile-up's figure, drawn on the server (a mini minute histogram). */
  pileup?: ReactNode }) {
  const { units } = useUnits();
  const label = goalLabel(goal);
  const seconds = goal * 60;
  const pKm = seconds / MARATHON_KM;
  const fine = splitTable(seconds, MARATHON_KM, units === 'mi' ? 'mi' : 'km');
  const span = observed ? `${clock(observed.lo)} to ${clock(observed.hi)}` : null;
  const even = CHECKPOINTS.map((km) => Math.round(evenAt(seconds, MARATHON_KM, km)));
  // Sentences built only from this goal's data (lib/tools/goal-facts.ts), so each goal page reads differently. The full
  // ones go to each chart's description; the page shows one short sentence per beat from the same medians.
  const gapText = observed ? evenPaceGapText(goal, observed.e50) : null;
  const groupText = observed?.held && observed.slow ? groupGapText(observed.held.e50, observed.slow.e50) : null;
  const i20 = CHECKPOINTS.indexOf(20);
  const last = CHECKPOINTS.length - 1;
  const groupShort = observed?.held && observed.slow && groupText
    ? `At 20K they were ${against(observed.slow.e50[i20] - observed.held.e50[i20])} those that held pace, and they finished ${finished(observed.slow.e50[last] - observed.held.e50[last])}.` : null;

  return (
    <>
      <section className="tool-reading night goal-pace-headline" aria-labelledby="goal-pace-title">
        <div className="tool-reading-head">
          <p className="tool-reading-kicker">Even pace for {label}</p>
          <h2 className="tool-reading-figure" id="goal-pace-title">
            {formatDuration(perUnit(pKm, units))}
            <small>per {unitWord(units)} · {paceText(pKm, other(units))} · halfway {clock(seconds / 2)}</small>
          </h2>
        </div>
        <ol className="tool-laps" aria-label={`Elapsed time at each 5 km mat for an even-pace ${label}`}>
          {CHECKPOINTS.map((km, i) => (
            <li key={km} className={i === CHECKPOINTS.length - 1 ? 'is-finish' : undefined}>
              <span>{i === CHECKPOINTS.length - 1 ? 'Finish' : `${km}K`}{units === 'mi' ? <small>{(km / KM_PER_MILE).toFixed(1)} mi</small> : null}</span>
              <b>{elapsed(even[i])}</b>
            </li>
          ))}
        </ol>
      </section>
      <Values id="goal-pace-every" caption={`Elapsed time at an even pace for a ${label} marathon, every ${unitWord(units)}, with the 5 km mats and halfway`} count={fine.length}>
        <table className="table">
          <thead><tr><th scope="col">Split</th><th scope="col">Elapsed</th></tr></thead>
          <tbody>
            {fine.map((r) => (
              <tr key={r.km} className={r.mat || r.halfway || r.finish ? 'is-reading' : undefined}>
                <th scope="row">{r.finish ? 'Finish' : r.halfway ? 'Halfway' : r.mat && units === 'mi' ? `${r.km}K mat` : units === 'mi' ? `${Math.round(r.km / KM_PER_MILE)} mi` : `${Math.round(r.km)} km${r.mat ? ' mat' : ''}`}</th>
                <td>{elapsed(r.elapsed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Values>

      {bunching ? (
        <section className="tool-panel goal-pace-bunching" aria-labelledby="goal-pace-bunching-title">
          <EvidenceTag kind="data" />
          <h2 className="tool-nugget-text" id="goal-pace-bunching-title">
            {count(bunching.before)} finishes landed in the last minute under {label}: <em>{bunching.ratio.toFixed(2)}×</em> what a smooth curve expects there.
          </h2>
          {pileup}
          <p className="tool-note goal-pace-more"><Link href="/stories/round-numbers">The 3:59 effect</Link></p>
        </section>
      ) : null}

      {/* One chart for what finishes just under the goal ran: held pace against a sustained slowdown, both against even
          pace. The median of every finish is the middle column of its Values, so no second, near-identical chart. */}
      {observed?.held && observed.slow && observed.sd != null ? (
        <section className="tool-panel goal-pace-slowdown" aria-labelledby="goal-pace-slowdown-title">
          {bunching ? null : <EvidenceTag kind="data" />}
          <h2 className="tool-nugget-text" id="goal-pace-slowdown-title">Finishes just under {label} didn’t run even either: <em>{pct(observed.sd)}</em> had a <SlowdownTerm />.</h2>
          {groupShort ? <p className="tool-panel-meta">{groupShort}</p> : null}
          <MatLines units={units} zero={`Even pace for ${label}`}
            lines={[
              { key: 'held', label: 'Held pace', tone: 'ink', gaps: CHECKPOINTS.map((_, i) => observed.held!.e50[i] - even[i]) },
              { key: 'slow', label: 'Sustained slowdown', tone: 'signal', gaps: CHECKPOINTS.map((_, i) => observed.slow!.e50[i] - even[i]) },
            ]}
            label={`Median elapsed time against even pace for ${label} at every mat: ${count(observed.held.n)} finishes from ${span} that held pace and ${count(observed.slow.n)} with a sustained slowdown. ${groupText ?? ''} ${gapText ?? ''}`} />
          <Values id="goal-pace-groups" caption={`Elapsed time at each mat: even pace for ${label}, and the median of ${count(observed.n)} finishes from ${span}, of those that held pace and of those with a sustained slowdown`} count={CHECKPOINTS.length}>
            <table className="table">
              <thead><tr><th scope="col">Mat</th><th scope="col">Even pace</th><th scope="col">Median</th><th scope="col">Held pace</th><th scope="col">Sustained slowdown</th></tr></thead>
              <tbody>
                {CHECKPOINTS.map((km, i) => (
                  <tr key={km}>
                    <th scope="row">{i === CHECKPOINTS.length - 1 ? 'Finish' : `${km}K`}</th>
                    <td>{elapsed(even[i])}</td>
                    <td>{elapsed(observed.e50[i])}</td>
                    <td>{elapsed(observed.held!.e50[i])}</td>
                    <td>{elapsed(observed.slow!.e50[i])}</td>
                  </tr>
                ))}
                <tr><th scope="row">Finishes</th><td></td><td>{count(observed.n)}</td><td>{count(observed.held.n)}</td><td>{count(observed.slow.n)}</td></tr>
              </tbody>
            </table>
          </Values>
        </section>
      ) : !observed ? (
        <section className="tool-panel">
          <EvidenceTag kind="data" />
          <p className="tool-state">The observed mat times are not available in this build. The even-pace splits still apply.</p>
        </section>
      ) : null}

      {/* One next step (the pace band); the chapter end below carries the way back. Other goals are one tap away on the
          pace chart and the tools list. */}
      <ToolHandoffs label={`Racing for ${label}?`} links={[
        { href: paceBandHref(goal), title: `Pace band for ${label}`, text: <>Print it, with the observed mat times for your course.</> },
      ]} />
    </>
  );
}
