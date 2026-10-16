'use client';

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { loadInsight, type Archetypes } from '@/lib/insights';
import {
  ahead, buildReport, kmText, openingPct, paceText, pctSigned, relation, reportCourseCity, reportLink, reportLines, reportScope, reportShardPath, shareText,
  type ReportComparison, type ReportData, type ReportGender, type ReportModel, type ReportRecord,
} from '@/lib/report';
import type { RaceInsights } from '@/lib/runner-context';
import { loadShard, type PaceBandIndex, type PaceBandShard } from '@/lib/tools/data';
import { PACE_BAND_INDEX } from '@/lib/tools/pace-band-data';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { formatDuration } from '@/lib/tools/time';
import { elevationLabel, type UnitSystem } from '@/lib/units';
import ReportActions, { ReportJump } from './ReportActions';

const ARCHETYPES = 'archetypes.json';
const count = (value: number) => value.toLocaleString('en-US');
const clock = (seconds: number) => formatDuration(seconds, true);
const editions = (k: number) => (k === 1 ? 'one edition' : `${count(k)} editions`);
const temperature = (c: number, units: UnitSystem) => `${(units === 'mi' ? c * 1.8 + 32 : c).toLocaleString('en-US', { maximumFractionDigits: 1 })}°${units === 'mi' ? 'F' : 'C'}`;
const wind = (mps: number, units: UnitSystem) => `${(mps * (units === 'mi' ? 2.2369362920544 : 3.6)).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units === 'mi' ? 'mph' : 'km/h'}`;
const localHour = (value: string) => {
  const match = /^(?:\d{4}-\d{2}-\d{2}T)?(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
};

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
 * The race report: a paper card that reads one race from its nine mat times, block by block, each data block with its
 * cohort and finishes, then the print, image, share and copy-link actions. The same component serves /report (typed or
 * linked times) and the runner view, where it adds the record's own edition and never names the runner.
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
  const link = reportLink(times, city, gender, fromRecord || Boolean(record));
  const retry = () => { if (index.error) index.retry(); else retryShard(); };
  const cardId = `${id}-card`;
  const actionsId = `${id}-actions`;
  useEffect(() => { if (focusOnOpen) document.getElementById(`${cardId}-title`)?.focus(); }, [focusOnOpen, cardId]);
  return (
    <div className="race-report-root ph-no-capture">
      <ReportCard id={cardId} model={model} units={units} level={level} gender={gender} dropped={dropped} retryComparison={retry} retryType={archetypes.retry}
        jump={<ReportJump cardId={cardId} actionsId={actionsId} />} />
      <ReportActions id={actionsId} model={model} units={units} link={link} cardId={cardId} gender={gender} />
    </div>
  );
}

/** A pace with its unit set smaller ("9:17" and "/mi"), so a narrow tile never breaks inside it. */
function PaceValue({ text }: { text: string }) {
  const slash = text.indexOf('/');
  return slash < 0 ? <>{text}</> : <>{text.slice(0, slash)}<small className="race-report-unit">{text.slice(slash)}</small></>;
}

/** The card itself, from a built model (exported for scripts/verify-report.cjs, which renders it without the data hooks). */
export function ReportCard({ id, model, units, level, gender, dropped, retryComparison, retryType, jump }: {
  id: string; model: ReportModel; units: UnitSystem; level: 1 | 3; gender: ReportGender; dropped: string | null; retryComparison: () => void; retryType: () => void;
  /** The print and "Save or share" buttons under the title (not printed). */
  jump?: ReactNode;
}) {
  const Title = level === 1 ? 'h1' : 'h3';
  const Head = level === 1 ? 'h2' : 'h4';
  const lines = reportLines(model, units);
  const { slowdown, opening, type, comparison } = model;
  const baseline = paceText(model.baseline, units);
  return (
    <article className="race-report ph-no-capture" id={id} aria-labelledby={`${id}-title`}>
      <header className="race-report-head">
        <p className="race-report-brand">Pace Notes</p>
        <Title className="race-report-title" id={`${id}-title`} tabIndex={-1}>Race report</Title>
        <p className="race-report-race">{model.race ?? 'Marathon'}<span> · {units === 'mi' ? '26.2 mi' : '42.2 km'}</span></p>
      </header>
      {jump}

      <div className="race-report-stats">
        <div className="race-report-stat"><span>Finish</span><strong>{lines.finish}</strong><small>{lines.pace}</small></div>
        <div className="race-report-stat"><span>5–20 km pace</span><strong><PaceValue text={baseline} /></strong><small>25% slower is {paceText(model.baseline * 1.25, units)}</small></div>
        <div className={`race-report-stat is-${slowdown.yes ? 'bad' : 'good'}`}><span>Sustained slowdown</span><strong>{slowdown.yes ? 'Yes' : 'No'}</strong>
          <small>{slowdown.yes && slowdown.onsetKm !== null ? `from ${kmText(slowdown.onsetKm, units)}, by the published definition` : 'by the published definition'}</small>
          <span className="race-report-badge is-research">Published research</span></div>
      </div>

      <section className="race-report-block race-report-sections" aria-labelledby={`${id}-sections`}>
        <Head id={`${id}-sections`}>Section by section</Head>
        <p className="race-report-meta">Calculated from these nine times: each section’s pace against this race’s own 5–20 km pace ({baseline}). The dashed line is 25% slower.</p>
        <SectionBars model={model} units={units} />
      </section>

      <div className="race-report-pair">
        <section className="race-report-block" aria-labelledby={`${id}-slowdown`}>
          <span className="race-report-badge is-research">Published research</span>
          <Head id={`${id}-slowdown`}>{slowdown.yes && slowdown.onsetKm !== null ? <>Sustained slowdown from {kmText(slowdown.onsetKm, units)}</> : <>No sustained slowdown</>}</Head>
          <p>{slowdown.yes ? <>Slow sections in a row: {kmText(Math.round(slowdown.slowKm * 1000) / 1000, units)}. </> : null}{SLOWDOWN_DEFINITION}</p>
          <p className="race-report-meta">Source: <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">{SLOWDOWN_CITATION.label}</a>. It describes the shape of this race, not why it happened.</p>
        </section>
        <section className="race-report-block" aria-labelledby={`${id}-opening`}>
          <Head id={`${id}-opening`}>Opening: {Math.abs(opening.fraction) < 0.0005 ? 'level with' : `${openingPct(opening.fraction)} ${opening.fraction < 0 ? 'quicker' : 'slower'} than`} the 5–20 km pace</Head>
          <p>The first {units === 'mi' ? '3.1 mi' : '5 km'} at {paceText(model.sections[0].pace, units)}{opening.band ? <>: the <strong>{opening.band.label.toLowerCase()}</strong> group of the six opening groups in the starting-pace analysis</> : null}.</p>
          <p className="race-report-meta">Calculated from these nine times; the groups are the starting-pace analysis’s definitions.</p>
        </section>
      </div>

      <section className="race-report-block" aria-labelledby={`${id}-type`}>
        <span className="race-report-badge is-data">Pace Notes data</span>
        <Head id={`${id}-type`}>{type.state === 'ok' ? <>Pacing type: {type.name}</> : <>Pacing type</>}</Head>
        {type.state === 'ok' ? (
          <p>The nearest of six pacing types, assigned after the race from its own splits: it describes a shape, not a grade. {count(type.n)} ({shareText(type.share)}, an observed share) of the {count(type.cohortN)} {type.label} are {type.name.toLowerCase()}s.</p>
        ) : type.state === 'off' ? (
          <div className="tool-state is-error"><p>{type.message} Everything else in this report still applies.</p><button type="button" className="button-secondary no-print" onClick={retryType}>Try again</button></div>
        ) : <p className="race-report-meta">Loading the pacing types…</p>}
      </section>

      <ComparisonBlock id={`${id}-compare`} Head={Head} comparison={comparison} model={model} gender={gender} dropped={dropped} retry={retryComparison} />

      {model.record ? <RecordBlock id={`${id}-record`} Head={Head} record={model.record} units={units} /> : null}

      <footer className="race-report-foot">
        <p><strong>splithappens.run</strong> · Calculated from nine {model.record ? 'official mat times of a recorded result' : 'mat times as entered'}. {type.state === 'ok' || comparison.state === 'ok' ? 'Shares are observed in complete finishes; nothing' : 'Nothing'} here is a prediction{model.record ? ', and weather and elevation are context, never adjustments' : ''}.</p>
      </footer>
    </article>
  );
}

/** The nine sections as bars from this race's own 5–20 km pace: right is slower, left quicker. */
function SectionBars({ model, units }: { model: ReportModel; units: UnitSystem }) {
  const values = model.sections.map((s) => s.vsBaseline);
  const lo = Math.min(-0.06, ...values);
  const hi = Math.max(0.3, ...values);
  const at = (v: number) => (100 * (v - lo)) / (hi - lo);
  return (
    <ol className="race-report-bars" style={{ ['--zero' as string]: `${at(0)}%`, ['--limit' as string]: `${at(0.25)}%` }}>
      {reportLines(model, units).sections.map((s, i) => (
        <li key={i} className={`is-${s.tone}${i >= 4 ? ' is-late' : ''}`}>
          <span className="race-report-bar-name">{s.label}</span>
          <span className="race-report-bar-track" aria-hidden="true"><i style={{ left: `${Math.min(at(0), at(s.vs))}%`, width: `${Math.max(0.6, Math.abs(at(s.vs) - at(0)))}%` }} /></span>
          <span className="race-report-bar-value"><b>{s.pace}</b> {s.change}</span>
        </li>
      ))}
    </ol>
  );
}

type HeadTag = 'h2' | 'h4';

function ComparisonBlock({ id, Head, comparison: c, model, gender, dropped, retry }: { id: string; Head: HeadTag; comparison: ReportComparison; model: ReportModel; gender: ReportGender; dropped: string | null; retry: () => void }) {
  const note = dropped ? <p className="race-report-meta">{dropped} is not one of the comparison’s courses, so this race is compared with finishes on all courses.</p> : null;
  return (
    <section className="race-report-block" aria-labelledby={id}>
      <span className="race-report-badge is-data">Pace Notes data</span>
      <Head id={id}>Compared with finishes at this time</Head>
      {c.state === 'loading' ? <p className="race-report-meta">Loading the finishes at this time…</p> : null}
      {c.state === 'off' ? <div className="tool-state is-error"><p>{c.message} The sections{model.type.state === 'off' ? ' and slowdown reading' : ', slowdown reading and pacing type'} above are unaffected.</p><button type="button" className="button-secondary no-print" onClick={retry}>Try again</button></div> : null}
      {c.state === 'unavailable' ? <p><strong>{c.title}</strong> {c.message}</p> : null}
      {c.state === 'ok' ? (
        <>
          <p>{count(c.n)} {c.label} ({editions(c.ed)}){c.slowdownShare !== null ? <>: <strong>{shareText(c.slowdownShare)}</strong> had a sustained slowdown (an observed share)</> : null}.
            {' '}At the 20 km mat this race was {c.groups.map((g) => `${relation(model.times[3] - g.at20)} the ${g.key === 'held' ? 'held-pace' : g.key === 'slowdown' ? 'sustained-slowdown' : 'window’s'} median`).join(' and ')}.</p>
          <div className="race-report-table"><table>
            <thead><tr><th scope="col">Group</th><th scope="col">Finishes</th><th scope="col">Median at 20 km</th><th scope="col">This race at 20 km</th><th scope="col">Median finish</th></tr></thead>
            <tbody>
              {c.groups.map((g) => <tr key={g.key}><th scope="row">{g.name}</th><td data-label="Finishes">{count(g.n)}</td><td data-label="Median at 20 km">{clock(g.at20)}</td><td data-label="This race at 20 km">{ahead(model.times[3] - g.at20)}</td><td data-label="Median finish">{clock(g.finish)}</td></tr>)}
            </tbody>
          </table></div>
          <p className="race-report-meta">This race: {clock(model.times[3])} at 20 km, {clock(model.finish)} at the finish.{c.missing ? ` ${c.missing}` : ''} {c.groups[0]?.key === 'all' ? '' : 'The groups are chosen by how their races ended, so the differences describe those races and do not show what caused them. '}Editions are pooled{gender === 'all' ? '' : `, and only finishes recorded as ${gender} are counted`}; runners who stopped are not in the data, and counts are finishes, not people.</p>
        </>
      ) : null}
      {note}
    </section>
  );
}

function RecordBlock({ id, Head, record: r, units }: { id: string; Head: HeadTag; record: ReportRecord; units: UnitSystem }) {
  return (
    <section className="race-report-block race-report-record" aria-labelledby={id}>
      <span className="race-report-badge is-data">Pace Notes data</span>
      <Head id={id}>In {r.edition}</Head>
      {r.state === 'loading' ? <p className="race-report-meta">Loading this edition’s comparisons and conditions…</p> : null}
      {r.state === 'off' ? <p className="tool-state is-error">{r.message}</p> : null}
      {r.state === 'ok' ? (
        <dl>
          <div><dt>Finish comparison</dt><dd>{'unavailable' in r.placement ? r.placement.unavailable : <>Faster than {r.placement.percentile.toLocaleString('en-US', { maximumFractionDigits: 1 })}% of the {count(r.placement.otherN)} other {r.placement.label} (ties count halfway). Observed rank {count(r.placement.rank)} of {count(r.placement.n)}, not an official placing{r.placement.ties ? `; ${count(r.placement.ties)} other ${r.placement.ties === 1 ? 'finish shares' : 'finishes share'} this time` : ''}. Median finish {clock(r.placement.medianFinish)}.</>}</dd></div>
          <div><dt>Late pace</dt><dd>{'unavailable' in r.late ? r.late.unavailable : <>From 30 km to the finish this race ran {pctSigned(r.late.race / 100, 1)} against its 5–20 km pace; the median of the {count(r.late.n)} {r.late.label} was {pctSigned(r.late.median / 100, 1)}. Higher means more slowing.</>}</dd></div>
          <div><dt>Weather</dt><dd>{'unavailable' in r.weather ? r.weather.unavailable : <>{temperature(r.weather.tempC, units)}, {r.weather.humidityPct.toLocaleString('en-US', { maximumFractionDigits: 1 })}% humidity and {wind(r.weather.windMps, units)} wind near the scheduled start{localHour(r.weather.start) ? ` (${localHour(r.weather.start)} local time)` : ''}: modelled weather, context, not personal exposure.</>}</dd></div>
          <div><dt>Climb</dt><dd>{'unavailable' in r.climb ? r.climb.unavailable : <>{elevationLabel(r.climb.gainM, units)} on the supplied current route, the sum of the 5 km sections: context, not an adjustment, and its historical validity is not established.</>}</dd></div>
        </dl>
      ) : null}
    </section>
  );
}
