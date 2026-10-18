'use client';

import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import BigNumber from '@/components/ui/BigNumber';
import TypeGlyph from '@/components/viz/TypeGlyph';
import { runnerHandoffHref } from '@/lib/analytics-policy';
import { loadInsight, type Archetypes } from '@/lib/insights';
import {
  ahead, buildReport, kmText, openingPct, paceText, pctSigned, relation, reportCourseCity, reportLink, reportLines, reportScope, reportShardPath, shareText,
  type ReportComparison, type ReportData, type ReportGender, type ReportGroup, type ReportModel, type ReportRecord,
} from '@/lib/report';
import type { RaceInsights } from '@/lib/runner-context';
import { loadShard, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { PACE_BAND_INDEX } from '@/lib/tools/pace-band-data';
import { formatDuration } from '@/lib/tools/time';
import { MARATHON_KM, distance, type UnitSystem } from '@/lib/units';
import LapList from './LapList';
import ReportActions from './ReportActions';

// A runner record's edition lines (/runners only) load with the record, so /report carries none of their code.
const RecordBlock = lazy(() => import('./RecordBlock').catch(() => ({ default: () => <p className="race-report-meta">This edition’s lines didn’t load. Reload the page to try again.</p> })));

const ARCHETYPES = 'archetypes.json';
const count = (value: number) => value.toLocaleString('en-US');
const clock = (seconds: number) => formatDuration(seconds, true);

/** The loader's own neutral message ("could not be loaded" / "could not be verified"); a browser network error reads as the first. */
const errorText = (e: unknown) => (e instanceof Error && e.message.startsWith('This data') ? e.message : 'This data could not be loaded. Check the connection and try again.');

/** One verified insights file (or nothing without its hash); `retry` loads it again. */
function useVerified<T>(path: string, sha: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!sha) return;
    let live = true;
    loadInsight<T>(path, sha).then((data) => { if (live) setState({ data, error: null }); }, (e: unknown) => { if (live) setState({ data: null, error: errorText(e) }); });
    return () => { live = false; };
  }, [path, sha, attempt]);
  const retry = useCallback(() => { setState({ data: null, error: null }); setAttempt((a) => a + 1); }, []);
  return { ...state, error: sha ? state.error : 'This data is not part of this build.', retry };
}

/** The one pace band shard the comparison needs, verified against its index. */
function useShard(index: PaceBandIndex | null, path: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string; attempt: number; data: PaceBandShard | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!index || !path) return;
    let live = true;
    loadShard<PaceBandShard>(index, path).then((data) => { if (live) setState({ path, attempt, data, error: null }); }, (e: unknown) => { if (live) setState({ path, attempt, data: null, error: errorText(e) }); });
    return () => { live = false; };
  }, [index, path, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { shard: state && state.path === path && state.attempt === attempt ? state : null, retry };
}

export interface RaceReportProps {
  /** Nine cumulative mat times in whole seconds, already checked (readReportTimes, validateSplits). */
  times: number[];
  /** The course slug the comparison uses, or `all`. */
  course: string;
  gender: ReportGender;
  data: ReportData;
  /** The card title's level: 1 on /report, 3 inside the runner view. */
  level: 1 | 3;
  /** A link opened from a runner record (via=runner): its onward links keep the marker. */
  fromRecord?: boolean;
  /** A runner record on /runners: its edition, that edition's context and the record's own late change. Never in a link. */
  record?: { edition: { city: string; year: number }; context: RaceInsights | null; error: string | null; lateChange: number };
  /** Opened by a press (the runner view): focus moves to the card's title once it shows, so a screen reader hears it. */
  focusOnOpen?: boolean;
}

/**
 * The race report: one race read from its nine mat times. A night "lap screen" (the race, the finish, and on /runners
 * where it sits among the edition's finishes, then the lap list), three tiles on paper (the sustained-slowdown reading,
 * the pacing type, the first 5K), the comparison with finishes at the same time, and on /runners the edition's late
 * pace, weather and climb; then the print, image, share and copy-link actions. Every block read from Pace Notes data or
 * published research carries its badge. The same component serves /report (typed or linked times) and the runner view,
 * where it adds the record's own edition and never names the runner.
 */
export default function RaceReport({ times, course, gender, data, level, fromRecord = false, record, focusOnOpen = false }: RaceReportProps) {
  const { units } = useUnits();
  const id = useId();
  const index = useVerified<PaceBandIndex>(PACE_BAND_INDEX, data.indexSha);
  const archetypes = useVerified<Archetypes>(ARCHETYPES, data.archetypesSha);
  const path = index.data ? reportShardPath(index.data, course, gender, times[8]) : null;
  const { shard, retry: retryShard } = useShard(index.data, path);
  const city = record?.edition.city ?? (course === 'all' ? null : reportCourseCity(data.courses, course) ?? index.data?.scopes.find((s) => s.slug === course)?.city ?? null);
  const model = useMemo(() => buildReport({
    times, race: { city }, openingBands: data.openingBands,
    types: { data: archetypes.data, error: archetypes.error, cohort: data.typeCohort },
    comparison: { index: index.data, indexError: index.error, course, gender, shard },
    record,
  }), [times, city, data.openingBands, data.typeCohort, archetypes.data, archetypes.error, index.data, index.error, course, gender, shard, record]);
  // A course the link names but the comparison does not know is never echoed into the card.
  const dropped = index.data && reportScope(index.data, course).dropped ? city ?? 'The course in this link' : null;
  const handoff = fromRecord || Boolean(record);
  const link = reportLink(times, city, gender, handoff);
  const retry = () => { if (index.error) index.retry(); else retryShard(); };
  const cardId = `${id}-card`;
  useEffect(() => { if (focusOnOpen) document.getElementById(`${cardId}-title`)?.focus(); }, [focusOnOpen, cardId]);
  return (
    <div className="race-report-root ph-no-capture">
      <ReportCard id={cardId} model={model} units={units} level={level} gender={gender} dropped={dropped} retryComparison={retry} retryType={archetypes.retry} handoff={handoff} />
      <ReportActions id={`${id}-actions`} model={model} units={units} link={link} cardId={cardId} gender={gender} />
    </div>
  );
}

/** Where every evidence badge leads: the evidence labels on /methodology. */
export const EVIDENCE_HREF = '/methodology#evidence';
/** Where the term "sustained slowdown" leads: its definition on /methodology. */
export const SLOWDOWN_HREF = '/methodology#sustained-slowdown';

/** An evidence badge, linked to what the label means. */
function Badge({ kind }: { kind: 'data' | 'research' }) {
  return <Link className={`race-report-badge is-${kind}`} href={EVIDENCE_HREF}>{kind === 'data' ? 'Pace Notes data' : 'Published research'}</Link>;
}

export type HeadTag = 'h2' | 'h4';

/** The card itself, from a built model (exported for scripts/verify-report.cjs, which renders it without the data hooks). */
export function ReportCard({ id, model, units, level, gender, dropped, retryComparison, retryType, handoff = false }: {
  id: string; model: ReportModel; units: UnitSystem; level: 1 | 3; gender: ReportGender; dropped: string | null; retryComparison: () => void; retryType: () => void;
  /** From a runner record: the one onward link keeps the handoff marker, so the page it opens is not recorded either. */
  handoff?: boolean;
}) {
  const Title = level === 1 ? 'h1' : 'h3';
  const Head: HeadTag = level === 1 ? 'h2' : 'h4';
  const lines = reportLines(model, units);
  const { slowdown, opening, type, comparison, record } = model;
  const lit = model.sections.map((s) => s.tone === 'qualify');
  const sr = (s: (typeof lines.sections)[number]) => `${s.label}: ${s.split}, ${s.pace}, ${s.change} against the 5–20K pace`;
  const placement = record?.state === 'ok' ? record.placement : null;
  return (
    <article className="race-report ph-no-capture" id={id} aria-labelledby={`${id}-title`}>
      <div className="race-report-screen night">
        <p className="race-report-kicker"><span>Race report</span><span>{distance(MARATHON_KM, units)}</span></p>
        <Title className="race-report-title" id={`${id}-title`} tabIndex={-1}><span className="race-report-race">{model.race ?? 'Marathon'}</span></Title>
        <p className="race-report-finish">
          <BigNumber value={lines.finish} sr={`Finish ${lines.finish}`} size="l" />
          <span className="race-report-average">{lines.pace}</span>
        </p>
        {/* The race's verdict in one line, under its finish: the reading the tiles below spell out. */}
        <p className="race-report-verdict">{slowdown.yes ? 'A' : 'No'} <Link className="term-link" href={SLOWDOWN_HREF}>sustained slowdown</Link>{slowdown.yes && slowdown.onsetKm !== null ? ` from ${kmText(slowdown.onsetKm)}` : ''}{type.state === 'ok' ? <> · <span>{type.name}</span></> : null}</p>
        {placement ? (
          <p className="race-report-sentence">
            {'unavailable' in placement ? placement.unavailable
              : <>Ahead of <em>{count(Math.floor(placement.percentile))} in every 100</em> of the {count(placement.otherN)} other {placement.label}.</>}
          </p>
        ) : null}
        <LapList rows={lines.sections.map((s, i) => ({ mat: s.mat, split: s.split, pace: s.pace, vs: s.vs, lit: lit[i], sr: sr(s) }))}
          baseline={paceText(model.baseline, units)} label={`Each mat's split and pace against this race's 5–20K pace${slowdown.yes && slowdown.onsetKm !== null ? `; a sustained slowdown from ${kmText(slowdown.onsetKm)}` : ''}`}
          caption={slowdown.yes ? 'Highlighted: the sustained slowdown.' : undefined} />
      </div>

      <div className="race-report-stats">
        <div className="race-report-stat"><span>Sustained slowdown</span><strong>{slowdown.yes ? 'Yes' : 'No'}</strong>
          {slowdown.yes && slowdown.onsetKm !== null ? <small>from {kmText(slowdown.onsetKm)}</small> : null}
          <Badge kind="research" /></div>
        <div className="race-report-stat is-type">
          <span>Pacing type</span>
          {type.state === 'ok' ? (
            <>
              <strong><TypeGlyph profile={type.profile} index={type.index} domain={type.domain} />{type.name}</strong>
              <small>{count(type.n)} of {count(type.cohortN)} finishes ({shareText(type.share)}) were {type.name.toLowerCase()}s.</small>
              <Badge kind="data" />
            </>
          ) : type.state === 'off' ? (
            <div className="tool-state is-error"><p>{type.message}</p><button type="button" className="btn btn-secondary is-compact no-print" onClick={retryType}>Try again</button></div>
          ) : <small className="race-report-meta">Loading the pacing types…</small>}
        </div>
        <div className="race-report-stat">
          <span>First 5K</span>
          <strong>{Math.abs(opening.fraction) < 0.0005 ? 'Level' : `${openingPct(opening.fraction)} ${opening.fraction < 0 ? 'quicker' : 'slower'}`}</strong>
          <small>{Math.abs(opening.fraction) < 0.0005 ? 'with' : 'than'} the 5–20K pace</small>
          <Link className="race-report-more no-print" href={handoff ? runnerHandoffHref('/analyses/starting-pace') : '/analyses/starting-pace'}>How openings like this finished</Link>
        </div>
      </div>

      <ComparisonBlock id={`${id}-compare`} Head={Head} comparison={comparison} model={model} gender={gender} dropped={dropped} retry={retryComparison} />

      {record ? <Suspense fallback={null}><RecordBlock id={`${id}-record`} Head={Head} record={record} units={units} /></Suspense> : null}

      <footer className="race-report-foot">
        <p><strong>splithappens.run</strong> · Not a prediction, and not an official placing.</p>
      </footer>
    </article>
  );
}

/** "the typical finisher who held pace": a comparison group's median, as the heading names it. */
const groupName = (g: ReportGroup) => (g.key === 'held' ? 'the typical finisher who held pace' : g.key === 'slowdown' ? 'the typical finisher with a sustained slowdown' : 'the typical finisher at this time');

function ComparisonBlock({ id, Head, comparison: c, model, gender, dropped, retry }: { id: string; Head: HeadTag; comparison: ReportComparison; model: ReportModel; gender: ReportGender; dropped: string | null; retry: () => void }) {
  const note = dropped ? <p className="race-report-meta">{dropped} is not one of the comparison’s courses, so this race is compared with finishes on all courses.</p> : null;
  const at20 = model.times[3];
  const lead = c.state === 'ok' ? c.groups[0] : null;
  return (
    <section className="race-report-block" aria-labelledby={id}>
      <Badge kind="data" />
      <Head id={id}>{lead ? `At 20K, ${relation(at20 - lead.at20)} ${groupName(lead)}.` : 'Compared with finishes at this time'}</Head>
      {c.state === 'loading' ? <p className="race-report-meta">Loading the finishes at this time…</p> : null}
      {c.state === 'off' ? <div className="tool-state is-error"><p>{c.message}</p><button type="button" className="btn btn-secondary is-compact no-print" onClick={retry}>Try again</button></div> : null}
      {c.state === 'unavailable' ? <p><strong>{c.title}</strong> {c.message}</p> : null}
      {c.state === 'ok' ? (
        <>
          <p>{count(c.n)} {c.label}{c.slowdownShare !== null ? <>: <strong>{shareText(c.slowdownShare)}</strong> had a sustained slowdown</> : null}.</p>
          <div className="race-report-table">
            <At20 race={at20} groups={c.groups} />
            <details className="values"><summary><span>Values<span className="values-count">{count(c.groups.length)} {c.groups.length === 1 ? 'row' : 'rows'}</span></span><span className="values-glyph" aria-hidden="true" /></summary>
              <div className="table-wrap" role="region" tabIndex={0} aria-label="Finishes at this time, by group"><table className="table">
                <caption>Finishes from {clock(c.lo)} to {clock(c.hi)}{gender === 'all' ? '' : `, recorded ${gender}`}</caption>
                <thead><tr><th scope="col">Group</th><th scope="col">Finishes</th><th scope="col">Median at 20K</th><th scope="col">Median finish</th></tr></thead>
                <tbody>{c.groups.map((g) => <tr key={g.key}><th scope="row">{g.name}</th><td>{count(g.n)}</td><td>{clock(g.at20)}</td><td>{clock(g.finish)}</td></tr>)}</tbody>
              </table></div>
            </details>
          </div>
          {c.missing ? <p className="race-report-meta">{c.missing}</p> : null}
        </>
      ) : null}
      {note}
    </section>
  );
}

/** h:mm, for the ends of the 20K scale. */
const hm = (seconds: number) => { const m = Math.round(seconds / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

/**
 * This race at 20K against each group's median there (a dumbbell list, drawn in HTML so the page carries no chart
 * code): the hollow ring is the group's median, the ink dot this race, the same mark in every row; only the first row's
 * gap, the one the heading names, is in signal. The scale runs a minute or more past the times on whole minutes, its ends labelled.
 */
function At20({ race, groups }: { race: number; groups: ReportGroup[] }) {
  const all = [race, ...groups.map((g) => g.at20)];
  const lo = (Math.floor(Math.min(...all) / 60) - 1) * 60, hi = (Math.ceil(Math.max(...all) / 60) + 1) * 60;
  const at = (v: number) => `${((100 * (v - lo)) / (hi - lo)).toFixed(2)}%`;
  return (
    <figure className="viz at20">
      <ul className="at20-rows" role="img" aria-label={`At 20K: this race ${clock(race)}; ${groups.map((g) => `${g.name.toLowerCase()} median ${clock(g.at20)}`).join('; ')}.`}>
        {groups.map((g, i) => (
          <li key={g.key} className={i === 0 ? 'is-lit' : undefined}>
            <span className="at20-label">{g.name}</span>
            <span className="at20-track" aria-hidden="true">
              <i style={{ left: at(Math.min(race, g.at20)), width: at(lo + Math.abs(race - g.at20)) }} />
              <b className="at20-median" style={{ left: at(g.at20) }} />
              <b className="at20-race" style={{ left: at(race) }} />
            </span>
            <span className="at20-value">{ahead(race - g.at20)}</span>
          </li>
        ))}
      </ul>
      <div className="at20-axis" aria-hidden="true"><span /><span className="at20-ends"><span>{hm(lo)}</span><span>{hm(hi)}</span></span><span /></div>
      <ul className="viz-key at20-key" aria-hidden="true"><li><i className="at20-key-median" />Group median at 20K</li><li><i className="at20-key-race" />This race at 20K</li></ul>
    </figure>
  );
}
