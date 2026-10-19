'use client';

import type { ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { EvidenceTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import DotGrid from '@/components/viz/DotGrid';
import ScrollCue from '@/components/ui/ScrollCue.client';
import { UNEVEN_SHARE, evenPaceGapText, groupGapText, type GoalPeer } from '@/lib/tools/goal-facts';
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

/**
 * Finishes in the minute before and after the goal mark (finish-times family), with the smooth-curve expectation, and the
 * pile-up: the run of minutes just before the mark each at least PILEUP_RATIO times the curve (null when none is).
 */
export interface GoalBunching { before: number; after: number; expected: number; ratio: number; ci: [number, number];
  run: { from: number; to: number; n: number; expected: number; ratio: number } | null }

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

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
  // No count here: the page's counts of finishes just under the goal are in its beats below.
  return <>The even-pace splits for a {label} marathon{observed ? <>, beside what finishes just under {label} actually ran</> : null}.</>;
}

/** Everything below the header of a goal page. Static HTML in miles; redrawn in km once the units preference is read. */
/** The pile-up's minutes as a table: each minute's finishes and the smooth curve's expectation, the reading row marked. */
export interface PileupTable { caption: string; rows: [string, string, string][]; reading: number }

/** One table of the page's "All numbers": its caption over a scrolling table, with the scroll cue the Values rows use. */
function NumbersTable({ id, caption, children }: { id: string; caption: string; children: ReactNode }) {
  return (
    <section className="values-table" id={id}>
      <p className="values-caption" id={`${id}-caption`}>{caption}</p>
      <div className="values-scroll"><div className="table-wrap" role="region" tabIndex={0} aria-labelledby={`${id}-caption`}>{children}</div></div>
      <ScrollCue target={id} />
    </section>
  );
}

export function GoalPaceBody({ goal, observed, bunching, pileup, pileupTable }: { goal: number; observed: GoalObserved | null; bunching: GoalBunching | null; peers?: GoalPeer[];
  /** The pile-up's figure, drawn on the server (a mini minute histogram). */
  pileup?: ReactNode;
  /** Its numbers, for the page's one "All numbers" disclosure. */
  pileupTable?: PileupTable | null }) {
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
  // A pile-up is a finding only when minutes before the mark stand well above the curve; a small bump reads as what it is.
  const run = bunching?.run ?? null;
  const runMinutes = run ? run.to - run.from + 1 : 0;
  const uneven = observed?.sd != null && observed.sd >= UNEVEN_SHARE;

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
      {/* The splits as a band to print, said beside them: the chapter end below is the page's one way forward. */}
      <p className="tool-note goal-pace-more goal-pace-band"><Link href={paceBandHref(goal)}>Print these as a pace band</Link></p>

      {bunching ? (
        <section className="tool-panel goal-pace-bunching" aria-labelledby="goal-pace-bunching-title">
          <EvidenceTag kind="data" />
          <h2 className="tool-nugget-text" id="goal-pace-bunching-title">
            {run
              ? <>The {runMinutes === 1 ? 'minute' : `${WORDS[runMinutes] ?? runMinutes} minutes`} before {label} held <em>{run.ratio.toFixed(2)}×</em> the finishes a smooth curve expects.</>
              : <>Finishes near {label} stay close to the smooth curve: the minute before it holds {bunching.ratio.toFixed(2)}× the curve.</>}
          </h2>
          {pileup}
        </section>
      ) : null}

      {/* What finishes just under the goal ran: the share with a sustained slowdown on 100 dots, every mat in the table. */}
      {observed?.held && observed.slow && observed.sd != null ? (
        <section className="tool-panel goal-pace-slowdown" aria-labelledby="goal-pace-slowdown-title">
          {bunching ? null : <EvidenceTag kind="data" />}
          <h2 className="tool-nugget-text" id="goal-pace-slowdown-title">{uneven
            ? <>Finishes just under {label} didn’t run even: <em>{pct(observed.sd)}</em> had a <SlowdownTerm />.</>
            : <>Most finishes just under {label} held their pace: only <em>{pct(observed.sd)}</em> had a <SlowdownTerm />.</>}</h2>
          {/* The share on 100 dots. The two groups mat by mat (held pace against a sustained slowdown) are the pace band's
              chart, one tap on; here they are a table in All numbers, so the two pages never draw the same chart. */}
          <DotGrid lit={Math.round(observed.sd * 100)} label={`Of 100 finishes from ${span}, ${Math.round(observed.sd * 100)} had a sustained slowdown. ${groupText ?? ''} ${gapText ?? ''}`.trim()} />
        </section>
      ) : !observed ? (
        <section className="tool-panel">
          <EvidenceTag kind="data" />
          <p className="tool-state">The observed mat times are not available in this build. The even-pace splits still apply.</p>
        </section>
      ) : null}

      {/* Section 00, cut 7: the page's tables in one disclosure at its foot, each with its caption, not a Values row under
          every beat. */}
      <details className="values all-numbers goal-pace-numbers" id="goal-pace-numbers">
        <summary>
          <span>All numbers<span className="values-count">{observed?.held && observed.slow ? (pileupTable ? 3 : 2) : pileupTable ? 2 : 1} tables</span></span>
          <span className="values-glyph" aria-hidden="true" />
        </summary>
        <div className="values-body all-numbers-body">
          <NumbersTable id="goal-pace-every" caption={`Elapsed time at an even pace for a ${label} marathon, every ${unitWord(units)}, with the 5 km mats and halfway`}>
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
          </NumbersTable>
          {observed?.held && observed.slow ? (
            <NumbersTable id="goal-pace-groups" caption={`Elapsed time at each mat: even pace for ${label}, and the median of ${count(observed.n)} finishes from ${span}, of those that held pace and of those with a sustained slowdown`}>
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
            </NumbersTable>
          ) : null}
          {pileupTable ? (
            <NumbersTable id="goal-pace-pileup" caption={pileupTable.caption}>
              <table className="table">
                <thead><tr><th scope="col">Minute</th><th scope="col">Finishes</th><th scope="col">Smooth curve</th></tr></thead>
                <tbody>
                  {pileupTable.rows.map((row, i) => (
                    <tr key={row[0]} className={i === pileupTable.reading ? 'is-reading' : undefined}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>
                  ))}
                </tbody>
              </table>
            </NumbersTable>
          ) : null}
        </div>
      </details>
    </>
  );
}
