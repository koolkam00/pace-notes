'use client';

import { Suspense, lazy, useEffect, useId, useMemo, useState, type ComponentType } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { distanceLabel, distanceValue, elevationLabel, paceLabel, paceValue, type UnitSystem } from '@/lib/units';
import { paceTicks } from '@/lib/pace-ticks';
import { runnerDuration, runnerMetrics, type RunnerManifest, type RunnerMetrics, type RunnerRace } from '@/lib/runner-search';
import { UnitLink } from './UnitsProvider';
import { courseSlug, splitCheckHref } from '@/lib/tools/links';
import { runnerHandoffHref } from '@/lib/analytics-policy';
import { trackFailure } from '@/lib/analytics';
import { chunkLoadFailed } from '@/lib/chunk-reload';
import { isCopyEdition, type CopyEdition } from '@/lib/duplicate-editions-shared';
import type { ReportData } from '@/lib/report';
import { loadRaceInsights, runnerAgeBand, runnerGender, type ComparisonKey, type PeerComparison, type RaceInsights, type RunnerTerrain, type RunnerWeather } from '@/lib/runner-context';
import type { RaceReportProps } from './report/RaceReport';

const count = (value: number) => value.toLocaleString('en-US');
const decimal = (value: number, digits = 1) => value.toLocaleString('en-US', { maximumFractionDigits: digits });
const titleFor = (race: RunnerRace, manifest: RunnerManifest) => `${manifest.editions[race.edition].city} ${manifest.editions[race.edition].year}`;
const difference = (value: number) => Math.abs(value) < 0.05 ? 'the same pace as' : `${decimal(Math.abs(value))}% ${value > 0 ? 'slower' : 'faster'} than`;
const timeDifference = (seconds: number) => Math.abs(seconds) < 0.0005 ? 'The same finish time' : `${runnerDuration(Math.abs(seconds))} ${seconds < 0 ? 'faster' : 'slower'}`;
type MeasuredRace = { race: RunnerRace; metrics: RunnerMetrics };
const temperature = (value: number, units: UnitSystem, delta = false) => `${decimal(units === 'mi' ? value * 1.8 + (delta ? 0 : 32) : value)}°${units === 'mi' ? 'F' : 'C'}`;
const wind = (value: number, units: UnitSystem) => `${decimal(value * (units === 'mi' ? 2.2369362920544 : 3.6))} ${units === 'mi' ? 'mph' : 'km/h'}`;
const precipitation = (value: number | null, units: UnitSystem) => value === null ? 'Not available' : `${decimal(value * (units === 'mi' ? 1 / 25.4 : 1), units === 'mi' ? 3 : 2)} ${units === 'mi' ? 'in' : 'mm'}`;
const localHour = (value: string) => {
  const match = /^(?:\d{4}-\d{2}-\d{2}T)?(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : 'Not available';
};
const NO_COPIES: CopyEdition[] = [];
// The race report's code loads only when a report is asked for, so /runners keeps its initial JavaScript.
const ReportUnavailable = () => <p className="rc-copy">The race report didn&apos;t load. Reload the page to try again.</p>;
const RaceReport = lazy<ComponentType<RaceReportProps>>(() => import('./report/RaceReport').catch((error: Error) => {
  if (chunkLoadFailed(error)) trackFailure('chunk_load'); else trackFailure('js_error');
  return { default: ReportUnavailable };
}));
/**
 * The record's nine times to the whole second, as its split-check and report links carry them. The record already passed
 * the eligibility checks (runnerMetrics); rounding can only tie two mats, and then there is no report.
 */
const wholeSeconds = (metrics: RunnerMetrics) => {
  const times = metrics.sections.map(section => Math.round(section.cumulative));
  return times.every((time, i) => time > (i ? times[i - 1] : 0)) ? times : null;
};
export const defaultGroup = (race: RunnerRace): ComparisonKey => runnerAgeBand(race.age) && runnerGender(race.sex) ? 'age_gender' : runnerGender(race.sex) ? 'gender' : runnerAgeBand(race.age) ? 'age' : 'all';

export function PacingReadings({ race, metrics, manifest, units }: MeasuredRace & { manifest: RunnerManifest; units: UnitSystem }) {
  const id = useId();
  const max = Math.max(...metrics.sections.map(section => section.pace));
  const splitHref = splitCheckHref(metrics.sections.map(section => section.cumulative), manifest.editions[race.edition]?.city);
  return <section aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Late in this race, your pace was {difference(metrics.lateChange)} your early pace.</h3>
    <p className="rc-copy">The opening section was {difference(metrics.openingChange)} the early baseline.</p>
    <h4 className="rc-chart-heading">Pace through {titleFor(race, manifest)}</h4>
    <div className="rc-pace-bars">{metrics.sections.map(section => <div className="rc-pace-row" key={section.end}>
      <span>{distanceLabel(section.start, units)}–{distanceLabel(section.end, units)}</span>
      <div className="rc-track" aria-hidden="true"><div style={{ width: `${100 * section.pace / max}%` }} /></div>
      <strong>{paceLabel(section.pace, units)}</strong>
    </div>)}</div>
    <details className="rc-details"><summary>See exact checkpoint readings</summary>
      <div className="rc-table-wrap" role="region" aria-label="Recorded checkpoints" tabIndex={0}><table><caption className="sr-only">Elapsed times and section paces</caption><thead><tr><th scope="col">Checkpoint</th><th scope="col">Elapsed</th><th scope="col">Section time</th><th scope="col">Section pace</th></tr></thead><tbody>{metrics.sections.map(section => <tr key={section.end}><th scope="row">{distanceLabel(section.end, units)}</th><td>{runnerDuration(section.cumulative)}</td><td>{runnerDuration(section.elapsed)}</td><td>{paceLabel(section.pace, units)}</td></tr>)}</tbody></table></div>
    </details>
    {splitHref && <p className="rc-note"><UnitLink href={runnerHandoffHref(splitHref)}>Read this race in the split check</UnitLink>, with its sustained-slowdown reading and finishes at the same time.</p>}
  </section>;
}

export function SectionComparison({ focus, reference, manifest, units }: { focus: MeasuredRace; reference: MeasuredRace; manifest: RunnerManifest; units: UnitSystem }) {
  const rows = focus.metrics.sections.map((section, i) => ({ ...section, delta: section.elapsed - reference.metrics.sections[i].elapsed }));
  const max = Math.max(1, ...rows.map(row => Math.abs(row.delta)));
  const largest = rows.reduce((best, row) => Math.abs(row.delta) > Math.abs(best.delta) ? row : best, rows[0]);
  return <>
    <div className="rc-pair-summary"><strong>{timeDifference(focus.metrics.finish - reference.metrics.finish)}</strong><p>{titleFor(focus.race, manifest)} compared with {titleFor(reference.race, manifest)}.</p></div>
    <p className="rc-copy">{Math.abs(largest.delta) < 0.0005 ? 'Every recorded section took the same time.' : <>The largest section difference was {distanceLabel(largest.start, units)}–{distanceLabel(largest.end, units)}: {runnerDuration(Math.abs(largest.delta))} {largest.delta < 0 ? 'less' : 'more'} time in the focus race.</>}</p>
    <div className="rc-delta-legend"><span>← Less time in focus race</span><span>More time in focus race →</span></div>
    <div className="rc-delta-bars">{rows.map(row => <div className="rc-delta-row" key={row.end}><span>{distanceLabel(row.start, units)}–{distanceLabel(row.end, units)}</span><div className="rc-delta-track" aria-hidden="true"><i /><b style={{ left: row.delta < 0 ? `${50 - 50 * Math.abs(row.delta) / max}%` : '50%', width: `${50 * Math.abs(row.delta) / max}%`, background: row.delta < 0 ? 'var(--course)' : '#B4380D' }} /></div><strong>{Math.abs(row.delta) < 0.0005 ? 'No change' : `${row.delta < 0 ? '−' : '+'}${runnerDuration(Math.abs(row.delta))}`}</strong></div>)}</div>
    <details className="rc-details"><summary>Compare exact section times</summary><div className="rc-table-wrap" role="region" aria-label="Selected race section comparison" tabIndex={0}><table><caption>Focus race minus comparison race</caption><thead><tr><th scope="col">Section</th><th scope="col">Focus race</th><th scope="col">Comparison race</th><th scope="col">Difference</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.end}><th scope="row">{distanceLabel(row.start, units)}–{distanceLabel(row.end, units)}</th><td>{runnerDuration(row.elapsed)}</td><td>{runnerDuration(reference.metrics.sections[i].elapsed)}</td><td>{Math.abs(row.delta) < 0.0005 ? 'No change' : `${row.delta < 0 ? '−' : '+'}${runnerDuration(Math.abs(row.delta))}`}</td></tr>)}</tbody></table></div></details>
  </>;
}

export function RunnerPeerComparison({ comparison, metrics, units }: { comparison: PeerComparison; metrics: RunnerMetrics; units: UnitSystem }) {
  const pace = comparison.pace;
  const rows = metrics.sections.map((section, i) => ({
    distance: distanceValue(section.end, units), section: `${distanceLabel(section.start, units)}–${distanceLabel(section.end, units)}`,
    yours: paceValue(section.pace, units), median: pace ? paceValue(pace.median[i], units) : null,
    range: pace ? [paceValue(pace.q25[i], units), paceValue(pace.q75[i], units)] : null,
  }));
  const paceTick = (value: number) => paceLabel(value / paceValue(1, units), units, false);
  // The pace axis on a round grid in the units shown (0:30 per mile), not Recharts' decimal steps; the distance axis at
  // recorded section ends, as on the analysis charts (components/QuestionViz.tsx), not at 3.1, 9.1, 15.1 mi.
  const sectionTicks = [5, 10, 20, 30, 40, 42.195].map(km => distanceValue(km, units));
  const plotted = rows.flatMap(row => [row.yours, ...(row.median === null ? [] : [row.median]), ...(row.range ?? [])]);
  const paceAxis = paceTicks(Math.min(...plotted), Math.max(...plotted), units);
  const lateDifference = pace ? metrics.lateChange - pace.late_change.median : null;
  return <>
    <div className="rc-placement"><div><strong>{decimal(comparison.percentile)}<span>%</span></strong><p>Finish percentile</p></div><div><strong>{count(comparison.rank)}<span> / {count(comparison.n)}</span></strong><p>Observed finish rank</p><small>{comparison.ties ? `${count(comparison.ties)} other ${comparison.ties === 1 ? 'finish shares' : 'finishes share'} this time` : 'No other finish shares this time'}</small></div></div>
    <p className="rc-note">{comparison.label} in this race edition: faster than {decimal(comparison.percentile)}% of the {count(comparison.other_n)} other finishes. Not an official race placing. Median finish: {runnerDuration(comparison.median_finish)}.</p>
    {pace ? <section className="rc-peer-pacing"><h3>How you paced it, beside similar finish times.</h3><p className="rc-copy">{count(pace.n)} finishes from {runnerDuration(pace.from_sec)} to under {runnerDuration(pace.to_sec)} in this same edition.</p>
      <p className="rc-takeaway">Your late-race pace change was {lateDifference !== null && Math.abs(lateDifference) < 0.05 ? 'about the same as' : `${decimal(Math.abs(lateDifference!))} percentage points ${lateDifference! > 0 ? 'higher than' : 'lower than'}`} the group median ({decimal(pace.late_change.median)}%).</p>
      <div className="rc-legend"><span><i className="rc-you-key" />Your pace</span><span><i className="rc-peer-key" />Group median</span><span><i className="rc-range-key" />Middle 50%</span></div>
      <div className="rc-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><ComposedChart data={rows} margin={{ top: 12, right: 18, bottom: 28, left: 4 }}><CartesianGrid stroke="#DCD3C2" vertical={false} /><XAxis dataKey="distance" type="number" domain={['dataMin', 'dataMax']} ticks={sectionTicks} minTickGap={20} tick={{ fontSize: 12 }} tickFormatter={value => decimal(value, 1)} tickLine={false} axisLine={false} label={{ value: `Section end (${units})`, position: 'insideBottom', offset: -18, fontSize: 12 }} /><YAxis type="number" domain={paceAxis ? paceAxis.domain : ['auto', 'auto']} ticks={paceAxis?.ticks} interval={paceAxis ? 0 : undefined} tick={{ fontSize: 12 }} tickFormatter={paceTick} width={48} tickLine={false} axisLine={false} /><Tooltip content={({ active, payload }) => {
        const row = payload?.[0]?.payload as typeof rows[number] | undefined;
        return active && row ? <div className="rc-tooltip"><strong>{row.section}</strong><p>Your pace: {paceTick(row.yours)}/{units}</p><p>Group median: {paceTick(row.median!)}/{units}</p><p>Middle 50%: {paceTick(row.range![0])}–{paceTick(row.range![1])}/{units}</p></div> : null;
      }} /><Area dataKey="range" type="linear" stroke="none" fill="#2F5BFF" fillOpacity={.22} isAnimationActive={false} /><Line dataKey="median" type="linear" stroke="#66625A" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} /><Line dataKey="yours" type="linear" stroke="#FF5B2E" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div>
      <details className="rc-details"><summary>See your pace beside the group</summary><div className="rc-table-wrap" role="region" aria-label="Runner and peer section paces" tabIndex={0}><table><caption>Your pace beside the group</caption><thead><tr><th scope="col">Section</th><th scope="col">Your pace</th><th scope="col">Median</th><th scope="col">Middle 50%</th></tr></thead><tbody>{metrics.sections.map((section, i) => <tr key={section.end}><th scope="row">{distanceLabel(section.start, units)}–{distanceLabel(section.end, units)}</th><td>{paceLabel(section.pace, units)}</td><td>{paceLabel(pace.median[i], units)}</td><td>{paceLabel(pace.q25[i], units)}–{paceLabel(pace.q75[i], units)}</td></tr>)}</tbody></table></div></details>
    </section> : <div className="rc-empty"><h3>The finish comparison is available. The pace group is too small.</h3><p>Choose a broader age or gender comparison to see a pacing profile.</p></div>}
  </>;
}

function WeatherContext({ weather, units }: { weather: RunnerWeather; units: UnitSystem }) {
  const rows = weather.hours.map(hour => ({ time: localHour(hour.time), temperature: units === 'mi' ? hour.temp_c * 1.8 + 32 : hour.temp_c }));
  return <section className="rc-weather"><h3>The weather recorded for this race day.</h3>
    <div className="rc-environment-numbers"><div><strong>{temperature(weather.temp_c, units)}</strong><span>Near the scheduled start</span></div><div><strong>{decimal(weather.humidity_pct)}%</strong><span>Relative humidity</span></div><div><strong>{wind(weather.wind_mps, units)}</strong><span>Start-hour wind</span></div><div><strong>{weather.warming_c > 0 ? '+' : ''}{temperature(weather.warming_c, units, true)}</strong><span>Temperature change over four hours</span></div></div>
    <p className="rc-note">Scheduled start: {localHour(weather.scheduled_start)} local time. Start-hour observation: {localHour(weather.start_hour)}. Dew point: {temperature(weather.dewpoint_c, units)}.{weather.feels_like_c !== null && <> Apparent temperature: {temperature(weather.feels_like_c, units)}.</>}</p>
    {rows.length > 1 && <><h4 className="rc-chart-heading">Temperature from the scheduled start window</h4><div className="rc-chart rc-weather-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><ComposedChart data={rows} margin={{ top: 12, right: 18, bottom: 12, left: 0 }}><CartesianGrid stroke="#DCD3C2" vertical={false} /><XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis domain={['auto', 'auto']} tickFormatter={value => decimal(value, 0) + '°'} tick={{ fontSize: 12 }} width={42} tickLine={false} axisLine={false} /><Tooltip formatter={value => [decimal(Number(value)) + (units === 'mi' ? '°F' : '°C'), 'Temperature']} labelFormatter={value => `${value} local time`} /><Line dataKey="temperature" stroke="#FF5B2E" strokeWidth={2.5} dot={{ r: 3 }} type="linear" isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div></>}
    <details className="rc-details"><summary>More weather readings</summary><div className="rc-table-wrap" role="region" aria-label="Hourly recorded weather" tabIndex={0}><table><caption>Local hourly readings</caption><thead><tr><th scope="col">Time</th><th scope="col">Temperature</th><th scope="col">Humidity</th><th scope="col">Wind</th><th scope="col">Preceding-hour precipitation</th></tr></thead><tbody>{weather.hours.map(hour => <tr key={hour.time}><th scope="row">{localHour(hour.time)}</th><td>{temperature(hour.temp_c, units)}</td><td>{hour.humidity_pct === null ? 'Not available' : decimal(hour.humidity_pct) + '%'}</td><td>{hour.wind_mps === null ? 'Not available' : wind(hour.wind_mps, units)}</td><td>{precipitation(hour.precip_mm, units)}</td></tr>)}</tbody></table></div><p className="rc-note">Cloud cover: {weather.cloud_pct === null ? 'not available' : decimal(weather.cloud_pct) + '%'}. Pressure: {weather.pressure_hpa === null ? 'not available' : decimal(weather.pressure_hpa) + ' hPa'}. Wind direction: {weather.wind_dir_deg === null ? 'not available' : decimal(weather.wind_dir_deg, 0) + '°'}.</p></details>
  </section>;
}

function TerrainContext({ terrain, metrics, units }: { terrain: RunnerTerrain; metrics: RunnerMetrics; units: UnitSystem }) {
  const max = Math.max(1, ...terrain.sections.map(section => Math.abs(section.net_m)));
  return <section className="rc-terrain"><h3>Your pacing beside the terrain.</h3>
    <div className="rc-environment-numbers"><div><strong>{elevationLabel(terrain.gain_m, units)}</strong><span>Climbing</span></div><div><strong>{elevationLabel(terrain.loss_m, units)}</strong><span>Descending</span></div></div>
    <div className="rc-terrain-heading"><span>Recorded section</span><span>Net elevation change</span><span>Your pace</span></div>
    <div className="rc-terrain-bars">{terrain.sections.map(section => {
      const pace = metrics.sections.find(row => Math.abs(row.start - section.start_km) < 0.0001 && Math.abs(row.end - section.end_km) < 0.0001)?.pace;
      return <div className="rc-terrain-row" key={section.end_km}><span>{distanceLabel(section.start_km, units)}–{distanceLabel(section.end_km, units)}</span><div className="rc-terrain-change"><div className="rc-delta-track" aria-hidden="true"><i /><b style={{ left: section.net_m < 0 ? `${50 - 50 * Math.abs(section.net_m) / max}%` : '50%', width: `${50 * Math.abs(section.net_m) / max}%`, background: section.net_m < 0 ? '#66625A' : '#FF5B2E' }} /></div><small>{section.net_m > 0 ? '+' : ''}{elevationLabel(section.net_m, units)}</small></div><strong>{pace === undefined ? 'Not available' : paceLabel(pace, units)}</strong></div>;
    })}</div>
    <details className="rc-details"><summary>See climbing and descending by section</summary><div className="rc-table-wrap" role="region" aria-label="Terrain by section" tabIndex={0}><table><caption>Course sections</caption><thead><tr><th scope="col">Section</th><th scope="col">Climbing</th><th scope="col">Descending</th><th scope="col">Net change</th></tr></thead><tbody>{terrain.sections.map(section => <tr key={section.end_km}><th scope="row">{distanceLabel(section.start_km, units)}–{distanceLabel(section.end_km, units)}</th><td>{elevationLabel(section.gain_m, units)}</td><td>{elevationLabel(section.loss_m, units)}</td><td>{elevationLabel(section.net_m, units)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export function RunnerConditions({ context, metrics, units }: { context: RaceInsights; metrics: RunnerMetrics; units: UnitSystem }) {
  return <>{context.weather ? <WeatherContext weather={context.weather} units={units} /> : <section className="rc-empty"><h3>Weather is not available for this edition.</h3></section>}{context.terrain ? <TerrainContext terrain={context.terrain} metrics={metrics} units={units} /> : <section className="rc-empty"><h3>Terrain is not available for this edition.</h3></section>}</>;
}

export default function RunnerContext({ races: selected, manifest, units, copyEditions = NO_COPIES, report }: { races: RunnerRace[]; manifest: RunnerManifest; units: UnitSystem; copyEditions?: readonly CopyEdition[]; report?: ReportData }) {
  const id = useId();
  // A copy edition repeats another year's field: it is no focus race, comparison, context row or split-check link.
  const races = useMemo(() => selected.filter(race => !isCopyEdition(manifest.editions[race.edition], copyEditions)), [selected, manifest, copyEditions]);
  const valid = useMemo(() => races.flatMap(race => { const metrics = runnerMetrics(race); return metrics ? [{ race, metrics }] : []; }).sort((a, b) => manifest.editions[a.race.edition].year - manifest.editions[b.race.edition].year || a.race.id - b.race.id), [races, manifest]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [referenceId, setReferenceId] = useState<number | null>(null);
  const [tab, setTab] = useState<'pacing' | 'peers' | 'conditions'>('pacing');
  const [groupState, setGroupState] = useState<{ race: number; key: ComparisonKey } | null>(null);
  const [contexts, setContexts] = useState<Record<number, RaceInsights>>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
  // The race whose report is open; another focus race closes it. Only a press moves focus into the report: coming back
  // to that focus race shows it again where it was.
  const [reportFor, setReportFor] = useState<number | null>(null);
  const [reportPressed, setReportPressed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setFailure(''); setContexts({});
    loadRaceInsights(races, manifest, controller.signal).then(data => { if (!controller.signal.aborted) { setContexts(data); setLoading(false); } }).catch(error => { if (!controller.signal.aborted) { setFailure(error instanceof Error ? error.message : 'Race context could not load. Try again.'); setLoading(false); } });
    return () => controller.abort();
  }, [races, manifest, retry]);
  const focus = valid.find(row => row.race.id === focusId) || valid[valid.length - 1];
  if (!focus) return null;
  const context = contexts[focus.race.id];
  const selectedGroup = groupState?.race === focus.race.id ? groupState.key : defaultGroup(focus.race);
  const comparison = context?.comparisons[selectedGroup];
  const age = runnerAgeBand(focus.race.age), gender = runnerGender(focus.race.sex);
  const groupOptions: { key: ComparisonKey; label: string; available: boolean }[] = [
    { key: 'all', label: 'All eligible runners', available: true },
    { key: 'gender', label: gender || 'Recorded gender unavailable', available: !!gender },
    { key: 'age', label: age ? `Ages ${age.replace('-', '–')}` : 'Usable exact age unavailable', available: !!age },
    { key: 'age_gender', label: age && gender ? `${gender}, ages ${age.replace('-', '–')}` : 'Age and gender comparison unavailable', available: !!age && !!gender },
  ];
  const others = valid.filter(row => row.race.id !== focus.race.id);
  const reference = others.find(row => row.race.id === referenceId) || others.find(row => manifest.editions[row.race.edition].city === manifest.editions[focus.race.edition].city) || others[0];
  const unavailable = <>{loading && <p className="rc-copy" role="status">Loading this edition’s comparisons and conditions…</p>}{failure && <div className="feedback-error" role="alert"><p>{failure}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}</>;
  const edition = manifest.editions[focus.race.edition];
  const reportTimes = report ? wholeSeconds(focus.metrics) : null;
  return <section className="runner-context ph-no-capture" aria-labelledby={`${id}-title`}>
    <header className="rc-heading"><p className="eyebrow">A closer look</p><h2 id={`${id}-title`}>Your race, in context.</h2><label htmlFor={`${id}-focus`}>Focus race<select id={`${id}-focus`} value={focus.race.id} onChange={event => { setReportPressed(false); setFocusId(Number(event.target.value)); }}>{valid.map(({ race, metrics }) => <option key={race.id} value={race.id}>{titleFor(race, manifest)} · {runnerDuration(metrics.finish)} · record {race.id}</option>)}</select></label></header>
    <div className="rc-tabs" role="group" aria-label="Race detail view">{([{ id: 'pacing', title: 'Your pacing' }, { id: 'peers', title: 'Similar runners' }, { id: 'conditions', title: 'Conditions' }] as const).map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} aria-controls={`${id}-panel`} onClick={() => setTab(item.id)}>{item.title}</button>)}</div>
    <div className="rc-panel" id={`${id}-panel`}>
      {tab === 'pacing' && <PacingReadings {...focus} manifest={manifest} units={units} />}
      {tab === 'peers' && <><label className="rc-group-control" htmlFor={`${id}-group`}>Compare with runners in this edition<select id={`${id}-group`} value={selectedGroup} onChange={event => setGroupState({ race: focus.race.id, key: event.target.value as ComparisonKey })}>{groupOptions.map(option => <option key={option.key} value={option.key} disabled={!option.available}>{option.label}</option>)}</select></label>{unavailable}{context && (comparison ? <RunnerPeerComparison comparison={comparison} metrics={focus.metrics} units={units} /> : <div className="rc-empty"><h3>This group is too small for a reliable comparison.</h3><p>Your recorded pacing remains available in “Your pacing.”</p>{selectedGroup !== 'all' && <button type="button" className="button-secondary" onClick={() => setGroupState({ race: focus.race.id, key: 'all' })}>Compare with all eligible runners</button>}</div>)}</>}
      {tab === 'conditions' && <>{unavailable}{context && <RunnerConditions context={context} metrics={focus.metrics} units={units} />}</>}
    </div>
    {report && reportTimes && <section className="rc-report" aria-labelledby={`${id}-report-title`}>
      <p className="eyebrow">Race report</p>
      <h3 id={`${id}-report-title`}>{titleFor(focus.race, manifest)} on one page.</h3>
      <p className="rc-copy">The section paces, the sustained-slowdown reading, the pacing type and finishes at the same time, with this edition’s finish comparison, weather and climb, to print, save or share. Neither the image nor the link holds a name or a record ID.</p>
      {/* Marked for section_viewed: the section tracker watches sections that join the page after it first looked. */}
      {reportFor === focus.race.id
        ? <div data-track-section="report"><Suspense fallback={<p className="rc-copy" role="status">Loading the race report…</p>}><RaceReport times={reportTimes} course={courseSlug(edition.city)} gender="all" data={report} level={3}
          record={{ edition: { city: edition.city, year: edition.year }, context: context ?? null, error: failure || null, lateChange: focus.metrics.lateChange }} focusOnOpen={reportPressed} /></Suspense></div>
        : <button type="button" className="button-secondary" onClick={() => { setReportPressed(true); setReportFor(focus.race.id); }}>Make a race report</button>}
    </section>}
    {reference && <section className="rc-multi" aria-labelledby={`${id}-comparison-title`}><p className="eyebrow">Across your selected races</p><h2 id={`${id}-comparison-title`}>Where did your time change?</h2><label htmlFor={`${id}-reference`}>Compare the focus race with<select id={`${id}-reference`} value={reference.race.id} onChange={event => setReferenceId(Number(event.target.value))}>{others.map(({ race, metrics }) => <option key={race.id} value={race.id}>{titleFor(race, manifest)} · {runnerDuration(metrics.finish)} · record {race.id}</option>)}</select></label><SectionComparison focus={focus} reference={reference} manifest={manifest} units={units} />
      <h3 className="rc-chart-heading">Read the races side by side.</h3>{unavailable}
      {!loading && !failure && <div className="rc-table-wrap" role="region" aria-label="Selected race context comparison" tabIndex={0}><table><caption>Your selected races side by side</caption><thead><tr><th scope="col">Race</th><th scope="col">Finish</th><th scope="col">Age/gender finish percentile</th><th scope="col">Start temperature</th><th scope="col">Humidity</th><th scope="col">Wind</th><th scope="col">Start-hour precipitation</th><th scope="col">Climbing</th></tr></thead><tbody>{valid.map(({ race, metrics }) => {
        const data = contexts[race.id], demographic = data?.comparisons[defaultGroup(race)];
        return <tr key={race.id}><th scope="row">{titleFor(race, manifest)}</th><td>{runnerDuration(metrics.finish)}</td><td>{demographic ? <>{decimal(demographic.percentile)}%<small>{demographic.label}</small></> : 'Not available'}</td><td>{data?.weather ? temperature(data.weather.temp_c, units) : 'Not available'}</td><td>{data?.weather ? decimal(data.weather.humidity_pct) + '%' : 'Not available'}</td><td>{data?.weather ? wind(data.weather.wind_mps, units) : 'Not available'}</td><td>{data?.weather ? precipitation(data.weather.precip_mm, units) : 'Not available'}</td><td>{data?.terrain ? elevationLabel(data.terrain.gain_m, units) : 'Not available'}</td></tr>;
      })}</tbody></table></div>}
    </section>}
    <p className="rc-next"><UnitLink href={runnerHandoffHref(`/analyses/pacing-pattern?race=${encodeURIComponent(manifest.editions[focus.race.edition].city)}&goal=${Math.round(focus.metrics.finish / 60)}&age=all&gender=all`)}>Explore pacing across the wider study <span aria-hidden="true">→</span></UnitLink></p>
  </section>;
}
