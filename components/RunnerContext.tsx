'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { distanceLabel, distanceValue, elevationLabel, paceLabel, paceValue, unitText, type UnitSystem } from '@/lib/units';
import { runnerDuration, runnerMetrics, type RunnerManifest, type RunnerMetrics, type RunnerRace } from '@/lib/runner-search';
import { UnitLink } from './UnitsProvider';
import { loadRaceInsights, runnerAgeBand, runnerGender, type ComparisonKey, type PeerComparison, type RaceInsights, type RunnerTerrain, type RunnerWeather } from '@/lib/runner-context';

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
export const defaultGroup = (race: RunnerRace): ComparisonKey => runnerAgeBand(race.age) && runnerGender(race.sex) ? 'age_gender' : runnerGender(race.sex) ? 'gender' : runnerAgeBand(race.age) ? 'age' : 'all';

export function PacingReadings({ race, metrics, manifest, units }: MeasuredRace & { manifest: RunnerManifest; units: UnitSystem }) {
  const id = useId();
  const max = Math.max(...metrics.sections.map(section => section.pace));
  return <section aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Late in this race, your pace was {difference(metrics.lateChange)} your early pace.</h3>
    <p className="rc-copy">The opening section was {difference(metrics.openingChange)} the early baseline. These comparisons describe the recorded paces; they do not establish why your pace changed.</p>
    <h4 className="rc-chart-heading">Pace through {titleFor(race, manifest)}</h4>
    <p className="rc-note">A longer bar means a slower pace.</p>
    <div className="rc-pace-bars">{metrics.sections.map(section => <div className="rc-pace-row" key={section.end}>
      <span>{distanceLabel(section.start, units)}–{distanceLabel(section.end, units)}</span>
      <div className="rc-track" aria-hidden="true"><div style={{ width: `${100 * section.pace / max}%` }} /></div>
      <strong>{paceLabel(section.pace, units)}</strong>
    </div>)}</div>
    <p className="rc-note">Early pace covers {distanceLabel(5, units)}–{distanceLabel(20, units)}; late pace covers {distanceLabel(30, units)}–finish. The source records sections of {distanceLabel(5, units)}, then a final {distanceLabel(2.195, units)}. These are recorded sections, with no inferred individual-mile or halfway readings.</p>
    <details className="rc-details"><summary>See exact checkpoint readings</summary><p className="rc-note">Elapsed and section times are shown to the nearest millisecond. Displayed pace is rounded to the nearest second per {units === 'mi' ? 'mile' : 'kilometre'}.</p>
      <div className="rc-table-wrap" role="region" aria-label="Recorded checkpoints" tabIndex={0}><table><caption className="sr-only">Recorded elapsed times and calculated section paces</caption><thead><tr><th scope="col">Checkpoint</th><th scope="col">Elapsed</th><th scope="col">Section time</th><th scope="col">Section pace</th></tr></thead><tbody>{metrics.sections.map(section => <tr key={section.end}><th scope="row">{distanceLabel(section.end, units)}</th><td>{runnerDuration(section.cumulative)}</td><td>{runnerDuration(section.elapsed)}</td><td>{paceLabel(section.pace, units)}</td></tr>)}</tbody></table></div>
    </details>
  </section>;
}

export function SectionComparison({ focus, reference, manifest, units }: { focus: MeasuredRace; reference: MeasuredRace; manifest: RunnerManifest; units: UnitSystem }) {
  const rows = focus.metrics.sections.map((section, i) => ({ ...section, delta: section.elapsed - reference.metrics.sections[i].elapsed }));
  const max = Math.max(1, ...rows.map(row => Math.abs(row.delta)));
  const largest = rows.reduce((best, row) => Math.abs(row.delta) > Math.abs(best.delta) ? row : best, rows[0]);
  const sameCourse = manifest.editions[focus.race.edition].city === manifest.editions[reference.race.edition].city;
  return <>
    <div className="rc-pair-summary"><strong>{timeDifference(focus.metrics.finish - reference.metrics.finish)}</strong><p>{titleFor(focus.race, manifest)} compared with {titleFor(reference.race, manifest)}.</p></div>
    <p className="rc-copy">{Math.abs(largest.delta) < 0.0005 ? 'Every recorded section took the same time.' : <>The largest section difference was {distanceLabel(largest.start, units)}–{distanceLabel(largest.end, units)}: {runnerDuration(Math.abs(largest.delta))} {largest.delta < 0 ? 'less' : 'more'} time in the focus race.</>} {sameCourse ? 'The races share a course name; historical route changes are not verified.' : 'These are different courses. Each row compares the same distance interval on each course.'}</p>
    <div className="rc-delta-legend"><span>← Less time in focus race</span><span>More time in focus race →</span></div>
    <div className="rc-delta-bars">{rows.map(row => <div className="rc-delta-row" key={row.end}><span>{distanceLabel(row.start, units)}–{distanceLabel(row.end, units)}</span><div className="rc-delta-track" aria-hidden="true"><i /><b style={{ left: row.delta < 0 ? `${50 - 50 * Math.abs(row.delta) / max}%` : '50%', width: `${50 * Math.abs(row.delta) / max}%`, background: row.delta < 0 ? 'var(--course)' : '#B4380D' }} /></div><strong>{Math.abs(row.delta) < 0.0005 ? 'No change' : `${row.delta < 0 ? '−' : '+'}${runnerDuration(Math.abs(row.delta))}`}</strong></div>)}</div>
    <p className="rc-note">Section differences add up to the finish-time difference. This is a comparison of elapsed time, with no weather, terrain or fitness correction.</p>
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
  const lateDifference = pace ? metrics.lateChange - pace.late_change.median : null;
  return <>
    <div className="rc-placement"><div><strong>{decimal(comparison.percentile)}<span>%</span></strong><p>Finish percentile</p><small>Higher means faster</small></div><div><strong>{count(comparison.rank)}<span> / {count(comparison.n)}</span></strong><p>Observed finish rank</p><small>{comparison.ties ? `${count(comparison.ties)} other ${comparison.ties === 1 ? 'finish shares' : 'finishes share'} this time` : 'No other finish shares this time'}</small></div></div>
    <p className="rc-note">{comparison.label} in this race edition. Percentile compares your finish with {count(comparison.other_n)} other eligible finishes; ties count halfway. Rank is among the {count(comparison.n)} recorded eligible finishes, including yours, and is not an official race placing. Median finish: {runnerDuration(comparison.median_finish)}.</p>
    {pace ? <section className="rc-peer-pacing"><h3>How you paced it, beside similar finish times.</h3><p className="rc-copy">{count(pace.n)} finishes in this comparison group, from {runnerDuration(pace.from_sec)} to under {runnerDuration(pace.to_sec)} in this same edition. This achieved-time band describes pacing patterns; it does not reveal intended race goals.</p>
      <p className="rc-takeaway">Your late-race pace change was {lateDifference !== null && Math.abs(lateDifference) < 0.05 ? 'about the same as' : `${decimal(Math.abs(lateDifference!))} percentage points ${lateDifference! > 0 ? 'higher than' : 'lower than'}`} the group median ({decimal(pace.late_change.median)}%). Higher means more slowing relative to early pace.</p>
      <div className="rc-legend"><span><i className="rc-you-key" />Your pace</span><span><i className="rc-peer-key" />Group median</span><span><i className="rc-range-key" />Middle 50%</span></div>
      <div className="rc-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><ComposedChart data={rows} margin={{ top: 12, right: 18, bottom: 28, left: 4 }}><CartesianGrid stroke="#DCD3C2" vertical={false} /><XAxis dataKey="distance" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 12 }} tickFormatter={value => decimal(value, 1)} tickLine={false} axisLine={false} label={{ value: `Section end (${units})`, position: 'insideBottom', offset: -18, fontSize: 12 }} /><YAxis type="number" domain={['auto', 'auto']} tick={{ fontSize: 12 }} tickFormatter={paceTick} width={48} tickLine={false} axisLine={false} /><Tooltip content={({ active, payload }) => {
        const row = payload?.[0]?.payload as typeof rows[number] | undefined;
        return active && row ? <div className="rc-tooltip"><strong>{row.section}</strong><p>Your pace: {paceTick(row.yours)}/{units}</p><p>Group median: {paceTick(row.median!)}/{units}</p><p>Middle 50%: {paceTick(row.range![0])}–{paceTick(row.range![1])}/{units}</p></div> : null;
      }} /><Area dataKey="range" type="linear" stroke="none" fill="#2F5BFF" fillOpacity={.22} isAnimationActive={false} /><Line dataKey="median" type="linear" stroke="#66625A" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} /><Line dataKey="yours" type="linear" stroke="#FF5B2E" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div>
      <p className="rc-note">Pace is minutes:seconds per {units === 'mi' ? 'mile' : 'kilometre'}. The shaded range is the middle half of individual section paces, not an uncertainty interval or a recommended pacing plan. The group contains your own result. Late change uses {distanceLabel(30, units)}–finish relative to {distanceLabel(5, units)}–{distanceLabel(20, units)}.</p>
      <details className="rc-details"><summary>See your pace beside the group</summary><div className="rc-table-wrap" role="region" aria-label="Runner and peer section paces" tabIndex={0}><table><caption>Same-edition achieved-time group</caption><thead><tr><th scope="col">Section</th><th scope="col">Your pace</th><th scope="col">Median</th><th scope="col">Middle 50%</th></tr></thead><tbody>{metrics.sections.map((section, i) => <tr key={section.end}><th scope="row">{distanceLabel(section.start, units)}–{distanceLabel(section.end, units)}</th><td>{paceLabel(section.pace, units)}</td><td>{paceLabel(pace.median[i], units)}</td><td>{paceLabel(pace.q25[i], units)}–{paceLabel(pace.q75[i], units)}</td></tr>)}</tbody></table></div></details>
    </section> : <div className="rc-empty"><h3>The finish comparison is available. The pace group is too small.</h3><p>The narrower group of similar achieved finish times needs at least 101 eligible finishes. Choose a broader age or gender comparison to look for a supported pacing profile.</p></div>}
  </>;
}

function WeatherContext({ weather, units }: { weather: RunnerWeather; units: UnitSystem }) {
  const rows = weather.hours.map(hour => ({ time: localHour(hour.time), temperature: units === 'mi' ? hour.temp_c * 1.8 + 32 : hour.temp_c }));
  return <section className="rc-weather"><h3>The weather recorded for this race day.</h3><p className="rc-copy">{weather.context_label}</p>
    <div className="rc-environment-numbers"><div><strong>{temperature(weather.temp_c, units)}</strong><span>Near the scheduled start</span></div><div><strong>{decimal(weather.humidity_pct)}%</strong><span>Relative humidity</span></div><div><strong>{wind(weather.wind_mps, units)}</strong><span>Start-hour wind</span></div><div><strong>{weather.warming_c > 0 ? '+' : ''}{temperature(weather.warming_c, units, true)}</strong><span>Temperature change over four hours</span></div></div>
    <p className="rc-note">Scheduled start: {localHour(weather.scheduled_start)} local time. Start-hour observation: {localHour(weather.start_hour)}. Dew point: {temperature(weather.dewpoint_c, units)}.{weather.feels_like_c !== null && <> Apparent temperature: {temperature(weather.feels_like_c, units)}.</>}</p>
    {rows.length > 1 && <><h4 className="rc-chart-heading">Temperature from the scheduled start window</h4><div className="rc-chart rc-weather-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><ComposedChart data={rows} margin={{ top: 12, right: 18, bottom: 12, left: 0 }}><CartesianGrid stroke="#DCD3C2" vertical={false} /><XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis domain={['auto', 'auto']} tickFormatter={value => decimal(value, 0) + '°'} tick={{ fontSize: 12 }} width={42} tickLine={false} axisLine={false} /><Tooltip formatter={value => [decimal(Number(value)) + (units === 'mi' ? '°F' : '°C'), 'Temperature']} labelFormatter={value => `${value} local time`} /><Line dataKey="temperature" stroke="#FF5B2E" strokeWidth={2.5} dot={{ r: 3 }} type="linear" isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div></>}
    <p className="rc-note">This is modeled weather near the scheduled start, not a measurement of your personal exposure. Wave starts are unavailable. The fixed four-hour window can extend beyond a faster finish.</p>
    <details className="rc-details"><summary>More weather readings and sources</summary><div className="rc-table-wrap" role="region" aria-label="Hourly recorded weather" tabIndex={0}><table><caption>Local hourly readings</caption><thead><tr><th scope="col">Time</th><th scope="col">Temperature</th><th scope="col">Humidity</th><th scope="col">Wind</th><th scope="col">Preceding-hour precipitation</th></tr></thead><tbody>{weather.hours.map(hour => <tr key={hour.time}><th scope="row">{localHour(hour.time)}</th><td>{temperature(hour.temp_c, units)}</td><td>{hour.humidity_pct === null ? 'Not available' : decimal(hour.humidity_pct) + '%'}</td><td>{hour.wind_mps === null ? 'Not available' : wind(hour.wind_mps, units)}</td><td>{precipitation(hour.precip_mm, units)}</td></tr>)}</tbody></table></div><p className="rc-note">{weather.precipitation_note}</p><p className="rc-note">Cloud cover: {weather.cloud_pct === null ? 'not available' : decimal(weather.cloud_pct) + '%'}. Pressure: {weather.pressure_hpa === null ? 'not available' : decimal(weather.pressure_hpa) + ' hPa'}. Wind direction: {weather.wind_dir_deg === null ? 'not available' : decimal(weather.wind_dir_deg, 0) + '°'}; this does not identify headwind along the course.</p>{weather.notes && <p className="rc-note">{weather.notes}</p>}<p className="rc-note">Source: {weather.source_url ? <a href={weather.source_url}>{weather.source}</a> : weather.source}.</p></details>
  </section>;
}

function TerrainContext({ terrain, metrics, units }: { terrain: RunnerTerrain; metrics: RunnerMetrics; units: UnitSystem }) {
  const max = Math.max(1, ...terrain.sections.map(section => Math.abs(section.net_m)));
  return <section className="rc-terrain"><h3>Put your pacing beside the supplied terrain.</h3><p className="rc-copy">{terrain.context_label}</p>
    <div className="rc-environment-numbers"><div><strong>{elevationLabel(terrain.gain_m, units)}</strong><span>Supplied climbing across the sections</span></div><div><strong>{elevationLabel(terrain.loss_m, units)}</strong><span>Supplied descending across the sections</span></div></div>
    <p className="rc-note">Historical validity: {terrain.historical_validity_known ? `${terrain.valid_from_year ?? 'unknown start'}–${terrain.valid_to_year ?? 'unknown end'}` : 'not established for this race year'}. This supplied route is context, not a verified reconstruction of the route you raced.</p>
    <div className="rc-terrain-heading"><span>Recorded section</span><span>Net elevation change</span><span>Your pace</span></div>
    <div className="rc-terrain-bars">{terrain.sections.map(section => {
      const pace = metrics.sections.find(row => Math.abs(row.start - section.start_km) < 0.0001 && Math.abs(row.end - section.end_km) < 0.0001)?.pace;
      return <div className="rc-terrain-row" key={section.end_km}><span>{distanceLabel(section.start_km, units)}–{distanceLabel(section.end_km, units)}</span><div className="rc-terrain-change"><div className="rc-delta-track" aria-hidden="true"><i /><b style={{ left: section.net_m < 0 ? `${50 - 50 * Math.abs(section.net_m) / max}%` : '50%', width: `${50 * Math.abs(section.net_m) / max}%`, background: section.net_m < 0 ? '#66625A' : '#FF5B2E' }} /></div><small>{section.net_m > 0 ? '+' : ''}{elevationLabel(section.net_m, units)}</small></div><strong>{pace === undefined ? 'Not available' : paceLabel(pace, units)}</strong></div>;
    })}</div>
    <p className="rc-note">Net change can hide climbs followed by descents. Showing terrain beside pace does not establish that elevation caused a pacing change.</p>
    <details className="rc-details"><summary>See terrain measurements and limitations</summary><div className="rc-table-wrap" role="region" aria-label="Supplied terrain by section" tabIndex={0}><table><caption>Supplied course sections</caption><thead><tr><th scope="col">Section</th><th scope="col">Climbing</th><th scope="col">Descending</th><th scope="col">Net change</th></tr></thead><tbody>{terrain.sections.map(section => <tr key={section.end_km}><th scope="row">{distanceLabel(section.start_km, units)}–{distanceLabel(section.end_km, units)}</th><td>{elevationLabel(section.gain_m, units)}</td><td>{elevationLabel(section.loss_m, units)}</td><td>{elevationLabel(section.net_m, units)}</td></tr>)}</tbody></table></div><p className="rc-note">{unitText(terrain.aggregation_method, units)}</p><p className="rc-note">Reported profile distance: {distanceLabel(terrain.profile_distance_km, units)}. Supplied segment span: {distanceLabel(terrain.segment_span_km, units)}.{terrain.reported_profile_gain_m !== null && <> Separately reported profile climbing: {elevationLabel(terrain.reported_profile_gain_m, units)}.</>}{terrain.reported_profile_loss_m !== null && <> Separately reported profile descending: {elevationLabel(terrain.reported_profile_loss_m, units)}.</>}</p>{terrain.notes && <p className="rc-note">{unitText(terrain.notes, units)}</p>}<p className="rc-note">Source: {terrain.source_url ? <a href={terrain.source_url}>{terrain.source}</a> : terrain.source}.</p></details>
  </section>;
}

export function RunnerConditions({ context, metrics, units }: { context: RaceInsights; metrics: RunnerMetrics; units: UnitSystem }) {
  return <>{context.weather ? <WeatherContext weather={context.weather} units={units} /> : <section className="rc-empty"><h3>Weather is not available for this edition.</h3><p>{context.weather_reason || 'This export does not supply a verified scheduled-start weather match.'}</p></section>}{context.terrain ? <TerrainContext terrain={context.terrain} metrics={metrics} units={units} /> : <section className="rc-empty"><h3>A usable supplied route is not available.</h3><p>{context.terrain_reason || 'This export does not supply a route that can be aligned with the recorded timing sections.'}</p></section>}</>;
}

export default function RunnerContext({ races, manifest, units }: { races: RunnerRace[]; manifest: RunnerManifest; units: UnitSystem }) {
  const id = useId();
  const valid = useMemo(() => races.flatMap(race => { const metrics = runnerMetrics(race); return metrics ? [{ race, metrics }] : []; }).sort((a, b) => manifest.editions[a.race.edition].year - manifest.editions[b.race.edition].year || a.race.id - b.race.id), [races, manifest]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [referenceId, setReferenceId] = useState<number | null>(null);
  const [tab, setTab] = useState<'pacing' | 'peers' | 'conditions'>('pacing');
  const [groupState, setGroupState] = useState<{ race: number; key: ComparisonKey } | null>(null);
  const [contexts, setContexts] = useState<Record<number, RaceInsights>>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
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
  return <section className="runner-context" aria-labelledby={`${id}-title`}>
    <header className="rc-heading"><p className="eyebrow">A closer look</p><h2 id={`${id}-title`}>Your race, in context.</h2><label htmlFor={`${id}-focus`}>Focus race<select id={`${id}-focus`} value={focus.race.id} onChange={event => setFocusId(Number(event.target.value))}>{valid.map(({ race, metrics }) => <option key={race.id} value={race.id}>{titleFor(race, manifest)} · {runnerDuration(metrics.finish)} · record {race.id}</option>)}</select></label></header>
    <div className="rc-tabs" role="group" aria-label="Race detail view">{([{ id: 'pacing', title: 'Your pacing' }, { id: 'peers', title: 'Similar runners' }, { id: 'conditions', title: 'Conditions' }] as const).map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} aria-controls={`${id}-panel`} onClick={() => setTab(item.id)}>{item.title}</button>)}</div>
    <div className="rc-panel" id={`${id}-panel`}>
      {tab === 'pacing' && <PacingReadings {...focus} manifest={manifest} units={units} />}
      {tab === 'peers' && <><label className="rc-group-control" htmlFor={`${id}-group`}>Compare with runners in this edition<select id={`${id}-group`} value={selectedGroup} onChange={event => setGroupState({ race: focus.race.id, key: event.target.value as ComparisonKey })}>{groupOptions.map(option => <option key={option.key} value={option.key} disabled={!option.available}>{option.label}</option>)}</select></label>{context && <p className="rc-note">{count(context.eligible_n)} eligible finishes in {titleFor(focus.race, manifest)}. Usable exact age: {count(context.age_n)}; recorded gender: {count(context.gender_n)}.{!age && ' This record has no usable exact age; its age is not inferred.'}{!gender && ' This record has no usable gender for a gender comparison.'}</p>}{unavailable}{context && (comparison ? <RunnerPeerComparison comparison={comparison} metrics={focus.metrics} units={units} /> : <div className="rc-empty"><h3>This group is too small for a reliable comparison.</h3><p>The selected group needs at least 101 eligible finishes in this edition. Your recorded pacing remains available in “Your pacing.”</p>{selectedGroup !== 'all' && <button type="button" className="button-secondary" onClick={() => setGroupState({ race: focus.race.id, key: 'all' })}>Compare with all eligible runners</button>}</div>)}</>}
      {tab === 'conditions' && <>{unavailable}{context && <RunnerConditions context={context} metrics={focus.metrics} units={units} />}</>}
    </div>
    {reference && <section className="rc-multi" aria-labelledby={`${id}-comparison-title`}><p className="eyebrow">Across your selected races</p><h2 id={`${id}-comparison-title`}>Where did your time change?</h2><label htmlFor={`${id}-reference`}>Compare the focus race with<select id={`${id}-reference`} value={reference.race.id} onChange={event => setReferenceId(Number(event.target.value))}>{others.map(({ race, metrics }) => <option key={race.id} value={race.id}>{titleFor(race, manifest)} · {runnerDuration(metrics.finish)} · record {race.id}</option>)}</select></label><SectionComparison focus={focus} reference={reference} manifest={manifest} units={units} />
      <h3 className="rc-chart-heading">Read the races side by side.</h3><p className="rc-note">Weather and terrain remain context. Percentiles compare different race fields and do not turn the results into adjusted finish times.</p>{unavailable}
      {!loading && !failure && <div className="rc-table-wrap" role="region" aria-label="Selected race context comparison" tabIndex={0}><table><caption>Race-day context for your eligible selected races</caption><thead><tr><th scope="col">Race</th><th scope="col">Finish</th><th scope="col">Age/gender finish percentile</th><th scope="col">Start temperature</th><th scope="col">Humidity</th><th scope="col">Wind</th><th scope="col">Start-hour precipitation</th><th scope="col">Supplied climbing</th></tr></thead><tbody>{valid.map(({ race, metrics }) => {
        const data = contexts[race.id], demographic = data?.comparisons[defaultGroup(race)];
        return <tr key={race.id}><th scope="row">{titleFor(race, manifest)}</th><td>{runnerDuration(metrics.finish)}</td><td>{demographic ? <>{decimal(demographic.percentile)}%<small>{demographic.label} · {count(demographic.n)} finishes</small></> : 'Not available'}</td><td>{data?.weather ? temperature(data.weather.temp_c, units) : 'Not available'}</td><td>{data?.weather ? decimal(data.weather.humidity_pct) + '%' : 'Not available'}</td><td>{data?.weather ? wind(data.weather.wind_mps, units) : 'Not available'}</td><td>{data?.weather ? precipitation(data.weather.precip_mm, units) : 'Not available'}</td><td>{data?.terrain ? elevationLabel(data.terrain.gain_m, units) : 'Not available'}</td></tr>;
      })}</tbody></table></div>}
      <p className="rc-note">When only age or gender is usable, the percentile uses that broader group, named in the cell. When neither is usable, it uses all eligible finishes. Sparse groups remain unavailable. Precipitation is the preceding-hour total at the start observation, including snow; it is not rainfall over your full race. Climbing comes from supplied route sections with unverified historical validity.</p>
    </section>}
    <p className="rc-next"><UnitLink href={`/analyses/pacing-pattern?race=${encodeURIComponent(manifest.editions[focus.race.edition].city)}&goal=${Math.round(focus.metrics.finish / 60)}&age=all&gender=all`}>Explore pacing across the wider study <span aria-hidden="true">→</span></UnitLink></p>
  </section>;
}
