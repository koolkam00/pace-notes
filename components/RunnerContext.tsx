'use client';

import { Suspense, lazy, useEffect, useId, useMemo, useState, type ComponentType } from 'react';
import { matLabel, paceLabel, paceValue, sectionLabel, type UnitSystem } from '@/lib/units';
import { paceTicks } from '@/lib/pace-ticks';
import { runnerDuration, runnerMetrics, type RunnerManifest, type RunnerMetrics, type RunnerRace } from '@/lib/runner-search';
import { UnitLink } from './UnitsProvider';
import Arrow from './ui/Arrow';
import Segmented from './ui/Segmented.client';
import Values from './ui/Values';
import LineProfile from './viz/LineProfile';
import ShareBar from './viz/ShareBar';
import LapList from './report/LapList';
import { courseSlug, splitCheckHref } from '@/lib/tools/links';
import { runnerHandoffHref } from '@/lib/analytics-policy';
import { trackFailure } from '@/lib/analytics';
import { chunkLoadFailed } from '@/lib/chunk-reload';
import { isCopyEdition, type CopyEdition } from '@/lib/duplicate-editions-shared';
import type { ReportData } from '@/lib/report';
import { openingPct, timesVerdict, toneOf } from '@/lib/report-shared';
import { readSplits } from '@/lib/tools/splits';
import { loadRaceInsights, runnerAgeBand, runnerGender, type ComparisonKey, type PeerComparison, type RaceInsights, type RunnerTerrain, type RunnerWeather } from '@/lib/runner-context';
import type { RaceReportProps } from './report/RaceReport';

const count = (value: number) => value.toLocaleString('en-US');
const decimal = (value: number, digits = 1) => value.toLocaleString('en-US', { maximumFractionDigits: digits });
const titleFor = (race: RunnerRace, manifest: RunnerManifest) => `${manifest.editions[race.edition].city} ${manifest.editions[race.edition].year}`;
/** A change in pace in whole percent, as every share on the site reads; under half a percent it is the same pace. */
const difference = (value: number) => Math.abs(value) < 0.5 ? 'the same pace as' : `${Math.round(Math.abs(value))}% ${value > 0 ? 'slower' : 'faster'} than`;
const timeDifference = (seconds: number) => Math.abs(seconds) < 0.0005 ? 'The same finish time' : `${runnerDuration(Math.abs(seconds))} ${seconds < 0 ? 'faster' : 'slower'}`;
const signed = (value: number) => { const text = decimal(Math.abs(value)); return `${Number(text) === 0 ? '' : value > 0 ? '+' : '−'}${text}%`; };
/** A section's time as a stopwatch split: m:ss, or h:mm:ss past the hour. */
const split = (seconds: number) => {
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
type MeasuredRace = { race: RunnerRace; metrics: RunnerMetrics };
/**
 * Whether a line crosses the box a gridline's label takes at the plot's right end (LineProfile: labels 12 px, 5 px over
 * the line, about 60 px wide on the narrowest phone plot, 200 px tall, the domain from 0.96 down to 0.12 of it).
 */
function crosses(values: number[], xs: number[], tick: number, [lo, hi]: [number, number]) {
  const H = 200, x0 = xs[0], x1 = xs[xs.length - 1], from = 1 - 64 / 288;
  const fy = (v: number) => (0.96 - ((v - lo) / (hi - lo || 1)) * 0.84) * H;
  const gy = fy(tick);
  for (let i = 1; i < xs.length; i++) {
    const a = (xs[i - 1] - x0) / (x1 - x0), b = (xs[i] - x0) / (x1 - x0);
    if (b < from) continue;
    for (let t = 0; t <= 1; t += 0.125) {
      if (a + (b - a) * t < from) continue;
      const y = fy(values[i - 1] + (values[i] - values[i - 1]) * t);
      if (y > gy - 21 && y < gy + 1) return true;
    }
  }
  return false;
}
/** A climb, a descent or a net change in whole feet or metres, as the course pages print them. */
const elevationLabel = (metres: number, units: UnitSystem) => {
  const v = Math.round(units === 'mi' ? metres / 0.3048 : metres);
  return `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')} ${units === 'mi' ? 'ft' : 'm'}`;
};
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

/**
 * The race's own pacing: the race report's verdict as the view's finding (the split check's rules on the record's whole
 * seconds: a sustained slowdown, where it began and how far off the 5–20K pace; or the slowest stretch after 20K), then
 * the lap list with the report's own rows lit, so the view and the report a tap below say the same thing in the same
 * words. With the race report open below, its own card carries the finding and the mats, so the heading and this list
 * step aside.
 */
export function PacingReadings({ race, metrics, manifest, units, laps = true }: MeasuredRace & { manifest: RunnerManifest; units: UnitSystem; laps?: boolean }) {
  const id = useId();
  const splitHref = splitCheckHref(metrics.sections.map(section => section.cumulative), manifest.editions[race.edition]?.city);
  const times = wholeSeconds(metrics);
  const reading = times ? readSplits(times) : null;
  const verdict = reading ? timesVerdict(reading) : null;
  const rows = metrics.sections.map((section, i) => {
    const vs = section.pace / metrics.baseline - 1;
    return { mat: matLabel(section.end), split: split(section.elapsed), pace: paceLabel(section.pace, units), vs, lit: reading ? toneOf(reading, i) === 'qualify' : false, sr: `${sectionLabel(section.start, section.end)}: ${paceLabel(section.pace, units)}, ${signed(100 * vs)} against the 5–20K pace` };
  });
  const term = <UnitLink className="term-link" href="/methodology#sustained-slowdown">sustained slowdown</UnitLink>;
  const heading = !verdict ? <>From 30K, the pace was {difference(metrics.lateChange)} the 5–20K pace.</>
    : verdict.slowdown ? <>A {term} from {matLabel(verdict.onsetKm)}, {verdict.off} off the 5–20K pace.</>
      : verdict.worst ? <>No {term}: the slowest stretch after 20K, {sectionLabel(metrics.sections[verdict.worst.index].start, metrics.sections[verdict.worst.index].end)}, ran {verdict.worst.off} off the 5–20K pace.</>
        : <>No {term}: every stretch after 20K held the 5–20K pace or better.</>;
  const opening = metrics.openingChange / 100;
  return <section className="rc-view" aria-labelledby={`${id}-title`}>
    {/* The race's voice, as the report beside it speaks: a name search can find a namesake's record. */}
    {/* With the report open below, its card says the same (its lap list and its First 5K tile), so the heading steps
        aside with the lap list: it stays the section's name for screen readers, over nothing visible. */}
    <h3 id={`${id}-title`} className={laps ? 'rc-h' : 'sr-only'}>{heading}</h3>
    {/* The first 5K only where it parted from the early pace by 1% or more: a smaller difference says nothing. In the
        report's words and precision ("5.3% quicker"), so the two never disagree. */}
    {laps && Math.abs(metrics.openingChange) >= 1 ? <p className="rc-copy">The first 5K was {openingPct(opening)} {opening < 0 ? 'quicker' : 'slower'} than the 5–20K pace.</p> : null}
    {laps ? <LapList rows={rows} baseline={paceLabel(metrics.baseline, units)} label={`Pace through ${titleFor(race, manifest)}, each mat against the 5–20K pace${verdict?.slowdown ? `; a sustained slowdown from ${matLabel(verdict.onsetKm)}` : ''}`}
      caption={verdict?.slowdown ? 'Highlighted: the sustained slowdown.' : undefined} /> : null}
    <details className="values rc-details"><summary><span>Checkpoint readings</span><span className="values-glyph" aria-hidden="true" /></summary>
      <div className="rc-table-wrap table-wrap" role="region" aria-label="Recorded checkpoints" tabIndex={0}><table className="table"><caption className="sr-only">Elapsed times and section paces</caption><thead><tr><th scope="col">Checkpoint</th><th scope="col">Elapsed</th><th scope="col">Section time</th><th scope="col">Section pace</th></tr></thead><tbody>{metrics.sections.map(section => <tr key={section.end}><th scope="row">{matLabel(section.end)}</th><td>{runnerDuration(section.cumulative)}</td><td>{runnerDuration(section.elapsed)}</td><td>{paceLabel(section.pace, units)}</td></tr>)}</tbody></table></div>
    </details>
    {splitHref && <p className="rc-next"><UnitLink className="btn btn-tertiary" href={runnerHandoffHref(splitHref)}>Read this race in the split check<Arrow /></UnitLink></p>}
  </section>;
}

/** Two of the selected races, section by section: the finish difference, and where it came from. */
export function SectionComparison({ focus, reference, manifest, units }: { focus: MeasuredRace; reference: MeasuredRace; manifest: RunnerManifest; units: UnitSystem }) {
  const rows = focus.metrics.sections.map((section, i) => ({ ...section, delta: section.elapsed - reference.metrics.sections[i].elapsed }));
  const max = Math.max(1, ...rows.map(row => Math.abs(row.delta)));
  const largest = rows.reduce((best, row) => Math.abs(row.delta) > Math.abs(best.delta) ? row : best, rows[0]);
  const deltaText = (seconds: number) => Math.abs(seconds) < 0.0005 ? 'No change' : `${seconds < 0 ? '−' : '+'}${runnerDuration(Math.abs(seconds))}`;
  const deltaShort = (seconds: number) => Math.abs(seconds) < 0.5 ? 'Level' : `${seconds < 0 ? '−' : '+'}${split(Math.abs(seconds))}`;
  return <>
    <div className="rc-pair-summary"><strong>{timeDifference(focus.metrics.finish - reference.metrics.finish)}</strong><p>{titleFor(focus.race, manifest)} compared with {titleFor(reference.race, manifest)}.</p></div>
    <p className="rc-copy">{Math.abs(largest.delta) < 0.0005 ? 'Every recorded section took the same time.' : <>The largest section difference was {sectionLabel(largest.start, largest.end)}: {runnerDuration(Math.abs(largest.delta))} {largest.delta < 0 ? 'less' : 'more'} time in the focus race.</>}</p>
    <figure className="viz rc-deltas">
      <ol className="rc-delta-rows" aria-label="Each section, the focus race's time against the comparison race's">{rows.map(row => <li className={row === largest && Math.abs(row.delta) >= 0.0005 ? 'is-lit' : undefined} key={row.end}><span>{sectionLabel(row.start, row.end)}</span><span className="rc-delta-track" aria-hidden="true"><b style={{ left: row.delta < 0 ? `${50 - 50 * Math.abs(row.delta) / max}%` : '50%', width: `${Math.max(0.5, 50 * Math.abs(row.delta) / max)}%` }} /></span><strong>{deltaShort(row.delta)}</strong></li>)}</ol>
      <figcaption className="rc-delta-key" aria-hidden="true"><span /><span className="rc-delta-key-track"><span>Less time</span><span>More time</span></span><span /></figcaption>
    </figure>
    <details className="values rc-details"><summary><span>Exact section times</span><span className="values-glyph" aria-hidden="true" /></summary><div className="rc-table-wrap table-wrap" role="region" aria-label="Selected race section comparison" tabIndex={0}><table className="table"><caption>Focus race minus comparison race</caption><thead><tr><th scope="col">Section</th><th scope="col">Focus race</th><th scope="col">Comparison race</th><th scope="col">Difference</th></tr></thead><tbody>{rows.map((row, i) => <tr key={row.end}><th scope="row">{sectionLabel(row.start, row.end)}</th><td>{runnerDuration(row.elapsed)}</td><td>{runnerDuration(reference.metrics.sections[i].elapsed)}</td><td>{deltaText(row.delta)}</td></tr>)}</tbody></table></div></details>
  </>;
}

/**
 * The late pace in plain words, this race's then the group's median ("This race slowed 14% late; the group's median
 * slowed 9%."), each against its own 5–20K pace, in whole percent: slowed, sped up, or held.
 */
export function lateWords(own: number, median: number): string {
  const said = (v: number) => (Math.abs(v) < 0.5 ? null : v > 0 ? `slowed ${Math.round(v)}%` : `sped up ${Math.round(-v)}%`);
  const mine = said(own), theirs = said(median);
  return `${mine ? `This race ${mine} late` : 'This race held its early pace late'}; the group’s median ${theirs ?? 'held its early pace'}.`;
}

/** Where the finish sits among this edition's finishes in the chosen group, then the pace beside similar finish times. */
export function RunnerPeerComparison({ comparison, metrics, units, edition }: { comparison: PeerComparison; metrics: RunnerMetrics; units: UnitSystem; edition: string }) {
  const pace = comparison.pace;
  const p = comparison.percentile;
  // In the race report's own words ("Ahead of 51 in every 100 other …", whole numbers down), so the two never disagree,
  // and without a count, which would stand beside the pace group's different one; the lit segment is the finishes
  // behind this race, the share the sentence names, and both segments are named under the bar.
  const ahead = Math.floor(p);
  const among = comparison.key === 'all' ? `other finishes in ${edition}` : 'other finishes in this group';
  const placement = <>
    <ShareBar labels="under" segments={[{ id: 'behind', label: 'Behind it', share: p / 100, display: `${ahead}%`, tone: 'signal' }, { id: 'ahead', label: 'In front of it', share: 1 - p / 100, display: `${100 - ahead}%`, tone: 'quiet' }]}
      label={`Ahead of ${ahead} in every 100 ${among}`} />
    <p className="rc-copy">Ahead of {ahead} in every 100 {among}.</p>
  </>;
  if (!pace) return <>{placement}<div className="rc-empty"><h3 className="rc-h">The finish comparison is available. The pace group is too small.</h3><p className="rc-copy">Choose a broader age or gender comparison to see a pacing profile.</p></div></>;
  const xs = metrics.sections.map(section => section.end);
  const yours = metrics.sections.map(section => paceValue(section.pace, units));
  const median = pace.median.map(v => paceValue(v, units)), lo = pace.q25.map(v => paceValue(v, units)), hi = pace.q75.map(v => paceValue(v, units));
  const axis = paceTicks(Math.min(...yours, ...lo), Math.max(...yours, ...hi), units, 6);
  const grid = axis ? [...new Set([axis.ticks[0], axis.ticks[Math.floor((axis.ticks.length - 1) / 2)], axis.ticks[axis.ticks.length - 1]])] : [];
  const tick = (v: number) => paceLabel(v / paceValue(1, units), units);
  // Gridline labels sit at the right end, over the line: a label the lines would cross there keeps its line, unlabelled.
  const clear = (v: number) => !axis || ![yours, median].some(values => crosses(values, xs, v, axis.domain));
  return <>
    {placement}
    <section className="rc-peer-pacing">
      <h3 className="rc-h">{lateWords(metrics.lateChange, pace.late_change.median)}</h3>
      <p className="rc-copy">{count(pace.n)} finishes from {runnerDuration(pace.from_sec)} to under {runnerDuration(pace.to_sec)} in this same edition.</p>
      <LineProfile x={xs} xDomain={[5, 42.195]} yDomain={axis ? axis.domain : undefined}
        xTicks={[5, 10, 20, 30, 42.195].map(km => ({ value: km, label: matLabel(km) }))}
        yTicks={grid.map(v => ({ value: v, label: clear(v) ? tick(v) : '' }))}
        layers={[{ id: 'pace', label: 'Pace', series: [{ id: 'median', values: median, dashed: true }, { id: 'you', values: yours, tone: 'signal' }], band: { lo, hi } }]}
        label={`Pace by section, higher is slower: this race beside the group median and its middle 50%. Late-race change ${decimal(metrics.lateChange)}% against the group's ${decimal(pace.late_change.median)}%.`}
        keys={[{ label: 'This race', mark: 'line', tone: 'signal' }, { label: 'Group median', mark: 'dash' }, { label: 'Middle 50%', mark: 'band' }]}
        height={200} heightMd={240}
        values={<Values id={`rc-peers-${comparison.key}`} caption="This race beside the group" columns={[{ key: 's', label: 'Section' }, { key: 'y', label: 'This race' }, { key: 'm', label: 'Median' }, { key: 'r', label: 'Middle 50%' }]}
          rows={metrics.sections.map((section, i) => [sectionLabel(section.start, section.end), paceLabel(section.pace, units), paceLabel(pace.median[i], units), `${paceLabel(pace.q25[i], units)}–${paceLabel(pace.q75[i], units)}`])} />} />
    </section>
  </>;
}

/**
 * The morning in one sentence, in whole degrees: the start's temperature and how far it moved four hours in ("54°F near
 * the start, 5°F warmer by 13:00"). The readings to a tenth are in the hourly table.
 */
function morning(weather: RunnerWeather, units: UnitSystem) {
  const deg = (c: number, delta = false) => Math.round(units === 'mi' ? c * 1.8 + (delta ? 0 : 32) : c);
  const unit = units === 'mi' ? '°F' : '°C';
  const by = localHour(weather.four_hour);
  const step = deg(Math.abs(weather.warming_c), true);
  const moved = step === 0 ? `about the same by ${by}` : `${step}${unit} ${weather.warming_c > 0 ? 'warmer' : 'cooler'} by ${by}`;
  return `${deg(weather.temp_c)}${unit} near the start, ${moved}.`;
}

function WeatherContext({ weather, units }: { weather: RunnerWeather; units: UnitSystem }) {
  return <section className="rc-weather"><h3 className="rc-h">{morning(weather, units)}</h3>
    <dl className="rc-cells"><div><dt>Relative humidity</dt><dd>{decimal(weather.humidity_pct)}%</dd></div><div><dt>Start-hour wind</dt><dd>{wind(weather.wind_mps, units)}</dd></div></dl>
    <details className="values rc-details"><summary><span>Hourly readings</span><span className="values-glyph" aria-hidden="true" /></summary><p className="rc-note">Scheduled start: {localHour(weather.scheduled_start)} local time. Start-hour observation: {localHour(weather.start_hour)}. Dew point: {temperature(weather.dewpoint_c, units)}.{weather.feels_like_c !== null && <> Apparent temperature: {temperature(weather.feels_like_c, units)}.</>}</p><div className="rc-table-wrap table-wrap" role="region" aria-label="Hourly recorded weather" tabIndex={0}><table className="table"><caption>Local hourly readings</caption><thead><tr><th scope="col">Time</th><th scope="col">Temperature</th><th scope="col">Humidity</th><th scope="col">Wind</th><th scope="col">Preceding-hour precipitation</th></tr></thead><tbody>{weather.hours.map(hour => <tr key={hour.time}><th scope="row">{localHour(hour.time)}</th><td>{temperature(hour.temp_c, units)}</td><td>{hour.humidity_pct === null ? 'Not available' : decimal(hour.humidity_pct) + '%'}</td><td>{hour.wind_mps === null ? 'Not available' : wind(hour.wind_mps, units)}</td><td>{precipitation(hour.precip_mm, units)}</td></tr>)}</tbody></table></div><p className="rc-note">Cloud cover: {weather.cloud_pct === null ? 'not available' : decimal(weather.cloud_pct) + '%'}. Pressure: {weather.pressure_hpa === null ? 'not available' : decimal(weather.pressure_hpa) + ' hPa'}. Wind direction: {weather.wind_dir_deg === null ? 'not available' : decimal(weather.wind_dir_deg, 0) + '°'}.</p></details>
  </section>;
}

/**
 * The terrain's finding beside this race's pacing: what the route did over the race's slowest 5K section (side by side,
 * never a cause), else the route's two totals.
 */
function terrainLine(terrain: RunnerTerrain, metrics: RunnerMetrics, units: UnitSystem) {
  const fives = metrics.sections.slice(0, -1);
  const slowest = fives.reduce((a, b) => (b.pace > a.pace ? b : a), fives[0]);
  // An even race has no slowest 5K to name (within half a second per km): the route's totals instead.
  const even = !slowest || Math.max(...fives.map(s => s.pace)) - Math.min(...fives.map(s => s.pace)) < 0.5;
  const at = !even && terrain.sections.find(section => Math.abs(section.start_km - slowest.start) < 0.0001 && Math.abs(section.end_km - slowest.end) < 0.0001);
  if (!at || !slowest) return `The route climbs ${elevationLabel(terrain.gain_m, units)} and descends ${elevationLabel(terrain.loss_m, units)}.`;
  // Under 10 m either way a 5K is nearly level (the course pages' rule for the first 5K).
  const where = Math.abs(at.net_m) < 10 ? 'is nearly level' : `${at.net_m > 0 ? 'climbs' : 'drops'} ${elevationLabel(Math.abs(at.net_m), units)} net`;
  // The section's name never breaks at its dash ("35–40K").
  return `The slowest 5K, ${sectionLabel(slowest.start, slowest.end).replace('–', '–\u2060')}, ${where}.`;
}

function TerrainContext({ terrain, metrics, units }: { terrain: RunnerTerrain; metrics: RunnerMetrics; units: UnitSystem }) {
  const max = Math.max(1, ...terrain.sections.map(section => Math.abs(section.net_m)));
  return <section className="rc-terrain"><h3 className="rc-h">{terrainLine(terrain, metrics, units)}</h3>
    <dl className="rc-cells"><div><dt>Climbing</dt><dd>{elevationLabel(terrain.gain_m, units)}</dd></div><div><dt>Descending</dt><dd>{elevationLabel(terrain.loss_m, units)}</dd></div></dl>
    <figure className="viz rc-terrain-figure">
      <div className="rc-terrain-head" aria-hidden="true"><span>Section</span><span>Net climb</span><span>Pace</span></div>
      <ol className="rc-terrain-rows" aria-label="Each section's net climb and the pace">{terrain.sections.map(section => {
        const pace = metrics.sections.find(row => Math.abs(row.start - section.start_km) < 0.0001 && Math.abs(row.end - section.end_km) < 0.0001)?.pace;
        return <li key={section.end_km}><span>{sectionLabel(section.start_km, section.end_km)}</span><span className="rc-terrain-change"><span className="rc-delta-track" aria-hidden="true"><b className={section.net_m > 0 ? 'is-up' : undefined} style={{ left: section.net_m < 0 ? `${50 - 50 * Math.abs(section.net_m) / max}%` : '50%', width: `${Math.max(0.5, 50 * Math.abs(section.net_m) / max)}%` }} /></span><small>{section.net_m > 0 ? '+' : ''}{elevationLabel(section.net_m, units)}</small></span><strong>{pace === undefined ? 'Not available' : paceLabel(pace, units)}</strong></li>;
      })}</ol>
    </figure>
    <details className="values rc-details"><summary><span>Climbing and descending by section</span><span className="values-glyph" aria-hidden="true" /></summary><div className="rc-table-wrap table-wrap" role="region" aria-label="Terrain by section" tabIndex={0}><table className="table"><caption>Course sections</caption><thead><tr><th scope="col">Section</th><th scope="col">Climbing</th><th scope="col">Descending</th><th scope="col">Net change</th></tr></thead><tbody>{terrain.sections.map(section => <tr key={section.end_km}><th scope="row">{sectionLabel(section.start_km, section.end_km)}</th><td>{elevationLabel(section.gain_m, units)}</td><td>{elevationLabel(section.loss_m, units)}</td><td>{elevationLabel(section.net_m, units)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export function RunnerConditions({ context, metrics, units }: { context: RaceInsights; metrics: RunnerMetrics; units: UnitSystem }) {
  return <>{context.weather ? <WeatherContext weather={context.weather} units={units} /> : <section className="rc-empty"><h3 className="rc-h">Weather is not available for this edition.</h3></section>}{context.terrain ? <TerrainContext terrain={context.terrain} metrics={metrics} units={units} /> : <section className="rc-empty"><h3 className="rc-h">Terrain is not available for this edition.</h3></section>}</>;
}

type Tab = 'pacing' | 'peers' | 'conditions';
const TABS: { value: Tab; label: string }[] = [{ value: 'pacing', label: 'Pacing' }, { value: 'peers', label: 'Similar runners' }, { value: 'conditions', label: 'Conditions' }];

export default function RunnerContext({ races: selected, manifest, units, copyEditions = NO_COPIES, report }: { races: RunnerRace[]; manifest: RunnerManifest; units: UnitSystem; copyEditions?: readonly CopyEdition[]; report?: ReportData }) {
  const id = useId();
  // A copy edition repeats another year's field: it is no focus race, comparison, context row or split-check link.
  const races = useMemo(() => selected.filter(race => !isCopyEdition(manifest.editions[race.edition], copyEditions)), [selected, manifest, copyEditions]);
  const valid = useMemo(() => races.flatMap(race => { const metrics = runnerMetrics(race); return metrics ? [{ race, metrics }] : []; }).sort((a, b) => manifest.editions[a.race.edition].year - manifest.editions[b.race.edition].year || a.race.id - b.race.id), [races, manifest]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [referenceId, setReferenceId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('pacing');
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
  // The peers open on every eligible finish in the edition, the group the race report places this race in, so the two
  // say one placement; the select narrows it.
  const selectedGroup = groupState?.race === focus.race.id ? groupState.key : 'all';
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
  const unavailable = <>{loading && <p className="rc-copy" role="status">Loading this edition’s comparisons and conditions…</p>}{failure && <div className="runner-error" role="alert"><p>{failure}</p><button type="button" className="btn btn-secondary is-compact" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}</>;
  const edition = manifest.editions[focus.race.edition];
  const reportTimes = report ? wholeSeconds(focus.metrics) : null;
  const reportOpen = reportFor === focus.race.id;
  // A race is named by its edition and finish; the record number is added only where two races would read the same.
  const raceName = ({ race, metrics }: MeasuredRace) => `${titleFor(race, manifest)} · ${runnerDuration(metrics.finish)}`;
  const optionText = (row: MeasuredRace, rows: MeasuredRace[]) => rows.filter(other => raceName(other) === raceName(row)).length > 1 ? `${raceName(row)} · record ${row.race.id}` : raceName(row);
  return <section className="runner-context ph-no-capture" aria-labelledby={`${id}-title`}>
    {/* One heading: the race in view (with two or more, the focus race the select picks). */}
    <header className="rc-heading"><h2 id={`${id}-title`}>{`${titleFor(focus.race, manifest)}, ${runnerDuration(focus.metrics.finish)}`}</h2><label className="rc-focus" htmlFor={`${id}-focus`} hidden={valid.length < 2}>Focus race<select id={`${id}-focus`} className="select" value={focus.race.id} onChange={event => { setReportPressed(false); setFocusId(Number(event.target.value)); }}>{valid.map(row => <option key={row.race.id} value={row.race.id}>{optionText(row, valid)}</option>)}</select></label></header>
    <Segmented className="rc-tabs" label="Race detail view" options={TABS} value={tab} onChange={setTab} block />
    <div className="rc-panel" id={`${id}-panel`}>
      {tab === 'pacing' && <PacingReadings {...focus} manifest={manifest} units={units} laps={!(report && reportTimes && reportOpen)} />}
      {tab === 'peers' && <><label className="rc-group-control" htmlFor={`${id}-group`}>Compare with runners in this edition<select id={`${id}-group`} className="select" value={selectedGroup} onChange={event => setGroupState({ race: focus.race.id, key: event.target.value as ComparisonKey })}>{groupOptions.map(option => <option key={option.key} value={option.key} disabled={!option.available}>{option.label}</option>)}</select></label>{unavailable}{context && (comparison ? <RunnerPeerComparison comparison={comparison} metrics={focus.metrics} units={units} edition={titleFor(focus.race, manifest)} /> : <div className="rc-empty"><h3 className="rc-h">This group is too small for a reliable comparison.</h3><p className="rc-copy">The recorded pacing is under “Pacing.”</p>{selectedGroup !== 'all' && <button type="button" className="btn btn-secondary is-compact" onClick={() => setGroupState({ race: focus.race.id, key: 'all' })}>Compare with all eligible runners</button>}</div>)}</>}
      {tab === 'conditions' && <>{unavailable}{context && <RunnerConditions context={context} metrics={focus.metrics} units={units} />}</>}
    </div>
    {report && reportTimes && <section className="rc-report" aria-labelledby={`${id}-report-title`}>
      <h3 id={`${id}-report-title`} className={reportOpen ? 'sr-only' : 'rc-h'}>{titleFor(focus.race, manifest)} on one page, to print or share.</h3>
      {/* Marked for section_viewed: the section tracker watches sections that join the page after it first looked. */}
      {reportOpen
        ? <div data-track-section="report"><Suspense fallback={<p className="rc-copy" role="status">Loading the race report…</p>}><RaceReport times={reportTimes} course={courseSlug(edition.city)} gender="all" data={report} level={3}
          record={{ edition: { city: edition.city, year: edition.year }, context: context ?? null, error: failure || null, lateChange: focus.metrics.lateChange }} focusOnOpen={reportPressed} /></Suspense></div>
        : <button type="button" className="btn btn-secondary" onClick={() => { setReportPressed(true); setReportFor(focus.race.id); }}>Make a race report</button>}
    </section>}
    {reference && <section className="rc-multi" aria-labelledby={`${id}-comparison-title`}><p className="t-kicker rc-kicker">Across your selected races</p><h2 id={`${id}-comparison-title`}>Where did the time change?</h2><label className="rc-focus" htmlFor={`${id}-reference`}>Compare the focus race with<select id={`${id}-reference`} className="select" value={reference.race.id} onChange={event => setReferenceId(Number(event.target.value))}>{others.map(row => <option key={row.race.id} value={row.race.id}>{optionText(row, others)}</option>)}</select></label><SectionComparison focus={focus} reference={reference} manifest={manifest} units={units} />
      {unavailable}
      {!loading && !failure && <details className="values rc-details"><summary><span>The races side by side</span><span className="values-glyph" aria-hidden="true" /></summary><div className="rc-table-wrap table-wrap" role="region" aria-label="Selected race context comparison" tabIndex={0}><table className="table"><caption>The selected races side by side</caption><thead><tr><th scope="col">Race</th><th scope="col">Finish</th><th scope="col">Age/gender finish percentile</th><th scope="col">Start temperature</th><th scope="col">Humidity</th><th scope="col">Wind</th><th scope="col">Start-hour precipitation</th><th scope="col">Climbing</th></tr></thead><tbody>{valid.map(({ race, metrics }) => {
        const data = contexts[race.id], demographic = data?.comparisons[defaultGroup(race)];
        return <tr key={race.id}><th scope="row">{titleFor(race, manifest)}</th><td>{runnerDuration(metrics.finish)}</td><td>{demographic ? <>{decimal(demographic.percentile)}%<small>{demographic.label}</small></> : 'Not available'}</td><td>{data?.weather ? temperature(data.weather.temp_c, units) : 'Not available'}</td><td>{data?.weather ? decimal(data.weather.humidity_pct) + '%' : 'Not available'}</td><td>{data?.weather ? wind(data.weather.wind_mps, units) : 'Not available'}</td><td>{data?.weather ? precipitation(data.weather.precip_mm, units) : 'Not available'}</td><td>{data?.terrain ? elevationLabel(data.terrain.gain_m, units) : 'Not available'}</td></tr>;
      })}</tbody></table></div></details>}
    </section>}
  </section>;
}
