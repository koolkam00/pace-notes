'use client';
import { useEffect, useId, useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { UnitLink, useUnits } from './UnitsProvider';
import { TEN_ANALYSES, analysisHref } from '@/lib/ten-analyses';
import { weatherHref } from '@/lib/weather-catalog';
import { weatherFinding, weatherLabel, weatherNumber, weatherUnit, weatherValue } from '@/lib/weather-display';
import { unitText } from '@/lib/units';
import { sourceLabel, sourceReleaseHref } from '@/lib/data-source';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';
import type { WeatherCandidate, WeatherDefinition, WeatherEdition, WeatherEvidence } from '@/lib/weather-types';

export default function WeatherAnalysis({ definition, candidate, evidence, questions }: { definition: WeatherDefinition; candidate: WeatherCandidate; evidence: WeatherEvidence; questions: WeatherDefinition[] }) {
  const { units } = useUnits();
  const [course, setCourse] = useState('All courses');
  const controlId = useId();
  const courses = [...new Set(evidence.editions.map(row => row.city))].sort();
  useEffect(() => {
    const restore = () => {
      const requested = new URLSearchParams(window.location.search).get('course');
      setCourse(requested && courses.includes(requested) ? requested : 'All courses');
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [evidence]); // The published course list belongs to this evidence snapshot.
  const rows = evidence.editions.filter(row => course === 'All courses' || row.city === course);
  const chartRows = rows.map(row => ({ ...row, exposure: weatherValue(row[candidate.exposure.key], candidate.id, units) }));
  const effect = candidate.effect;
  const isNull = candidate.takeaway_type === 'precise_null';
  const lower = Math.min(-1, effect.low, effect.estimate) - .3, upper = Math.max(1, effect.high, effect.estimate) + .3;
  const position = (value: number) => (value - lower) / (upper - lower) * 100;
  const pp = (value: number) => `${value > 0 ? '+' : ''}${weatherNumber(value, 2)}`;
  const release = sourceReleaseHref(evidence.input.release_tag);
  const source = sourceLabel(evidence.input.as_of, evidence.input.release_tag);
  const cohortCount = new Intl.NumberFormat('en-US').format(candidate.support.finishes);
  const archiveUrl = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/weather/evidence.json';
  const exposureHeading = { warming: 'Temperature rise in the first four hours', wind: 'Wind speed near the scheduled start', humidity: 'Dew point near the scheduled start' }[candidate.id];
  const caution = {
    wind: 'This comparison covers typical start-hour winds in the studied editions. It is not evidence that strong winds are harmless or that wind cannot affect finish times. Headwinds, gusts and total finish-time losses were not tested.',
    warming: 'The fixed four-hour window can extend beyond a faster runner’s finish. This association does not prove that warming caused a pacing change or tell an individual runner how much time they will lose.',
    humidity: 'Dew point describes moisture alongside temperature. This comparison does not isolate a physiological humidity penalty or predict an individual runner’s response.',
  }[candidate.id];
  return <div className="analysis-layout">
    <aside className="analysis-sidebar"><UnitLink href="/analyses" className="sidebar-heading">Explore the analyses</UnitLink><nav aria-label="Weather questions"><ol>{questions.map(item => <li key={item.id}><UnitLink href={weatherHref(item)} aria-current={item.id === candidate.id ? 'page' : undefined}>{item.shortTitle}</UnitLink></li>)}</ol></nav><p>One race day.<br />A closer look at conditions.</p><nav aria-label="The essential ten"><ol>{TEN_ANALYSES.map(item => <li key={item.id}><UnitLink href={analysisHref(item)}><span>{String(item.rank).padStart(2, '0')}</span>{unitText(item.shortTitle, units)}</UnitLink></li>)}</ol></nav></aside>
    <article className="analysis-main weather-analysis">
      <header className="analysis-heading"><UnitLink href="/analyses#weather-questions" className="eyebrow">A closer look at weather</UnitLink><h1>{definition.title}</h1><p>{definition.purpose}</p></header>
      <section className="analysis-finding"><p className="eyebrow">What the data shows</p><h2>{weatherFinding(candidate)}</h2>
        <p>{exposureHeading}: comparing {weatherLabel(candidate.exposure.q25, candidate.id, units)} with {weatherLabel(candidate.exposure.q75, candidate.id, units)}, {isNull ? 'the estimated difference in slowing was small.' : <>the larger value was associated with about {weatherNumber(Math.abs(effect.estimate))} percentage points {effect.estimate > 0 ? 'more' : 'less'} late-race slowing.</>}</p>
        <p className="comparison-context">{candidate.support.editions} race editions · {candidate.support.courses} courses · {cohortCount} complete finishes. Each edition has equal weight.</p><p className="study-meta">Source: <a href={release}>{source}</a>.</p><p className="coverage-notice">Compared within courses, accounting for start temperature, calendar year and the other modeled weather factors. Field composition and other differences can still matter.</p>
      </section>
      <section className="weather-estimate" aria-labelledby={`${controlId}-estimate`}><p className="eyebrow">The adjusted comparison</p><h2 id={`${controlId}-estimate`}>How much did slowing differ?</h2><div className="weather-effect-number"><strong>{pp(effect.estimate)}</strong><span>percentage points of late-race slowing</span></div>
        <p className="weather-contrast">{exposureHeading}: <strong>{weatherLabel(candidate.exposure.q25, candidate.id, units)} → {weatherLabel(candidate.exposure.q75, candidate.id, units)}</strong></p>
        <div className="weather-confidence" role="img" aria-label={`Estimated difference ${pp(effect.estimate)} percentage points; ${weatherNumber(effect.confidence * 100)}% uncertainty interval ${pp(effect.low)} to ${pp(effect.high)} percentage points. Zero means no difference.`}>
          <div className="weather-confidence-track" aria-hidden="true">{isNull && <span className="weather-equivalence" style={{ left: position(-1) + '%', width: position(1) - position(-1) + '%' }} />}<span className="weather-confidence-zero" style={{ left: position(0) + '%' }} /><span className="weather-confidence-range" style={{ left: position(effect.low) + '%', width: position(effect.high) - position(effect.low) + '%' }} /><span className="weather-confidence-point" style={{ left: position(effect.estimate) + '%' }} /></div><div className="weather-confidence-axis" aria-hidden="true"><span>{weatherNumber(lower)}</span><span style={{ left: position(0) + '%' }}>0</span><span>{weatherNumber(upper)}</span></div>
        </div><p className="weather-interval">Uncertainty range: <strong>{pp(effect.low)} to {pp(effect.high)} percentage points</strong>. Zero means no difference.</p><p className="control-help">{isNull ? 'The shaded band marks differences smaller than one percentage point in either direction. The whole uncertainty range stays inside it.' : `The dot is the estimated difference. The line shows the uncertainty range; it remains ${effect.estimate > 0 ? 'above' : 'below'} zero.`} The range accounts for testing three weather questions.</p>
      </section>
      <section className="analysis-reading"><div><h2>How to read this</h2><p>{unitText('Slowing compares pace over 20–40 km with pace over 0–20 km. For example, 7% slowing instead of 5% is a difference of 2 percentage points. The final 2.195 km is excluded.', units)}</p></div><div><h2>Keep in mind</h2><p>{caution}</p></div></section>
      <section className="weather-observations" aria-labelledby={`${controlId}-observations`}><p className="eyebrow">Behind the comparison</p><h2 id={`${controlId}-observations`}>See the race days.</h2><p>Each dot represents one edition. These are the observed values before adjustment. Browse a course to see its editions; the adjusted result above remains the full-study comparison.</p>
        <label className="weather-course-control" htmlFor={`${controlId}-course`}>Browse race editions<select id={`${controlId}-course`} value={course} onChange={event => {
          const value = event.target.value; setCourse(value);
          trackAnalytics('analysis_filters_applied', { analysis: candidate.id, course_scope: value === 'All courses' ? 'all' : 'single' });
          const url = new URL(window.location.href); if (value === 'All courses') url.searchParams.delete('course'); else url.searchParams.set('course', value);
          window.history.replaceState(window.history.state, '', unitHref(url.pathname + url.search + url.hash, units));
        }}><option>All courses</option>{courses.map(city => <option key={city}>{city}</option>)}</select></label>
        <p className="study-meta" aria-live="polite">Showing {rows.length} {rows.length === 1 ? 'edition' : 'editions'}{course === 'All courses' ? ' across all courses' : ' in ' + course}.</p>
        <div className="chart weather-scatter"><ResponsiveContainer width="100%" height="100%" minWidth={0}><ScatterChart margin={{ top: 15, right: 16, bottom: 30, left: 0 }}><CartesianGrid stroke="#DCD3C2" /><XAxis dataKey="exposure" type="number" name={exposureHeading} tickLine={false} axisLine={false} tick={{ fontSize: 13 }} tickFormatter={value => weatherNumber(value, 0)} domain={['dataMin', 'dataMax']} label={{ value: ({ warming: 'Temperature rise', wind: 'Wind speed', humidity: 'Dew point' }[candidate.id]) + ' (' + weatherUnit(candidate.id, units) + ')', position: 'insideBottom', offset: -18, fontSize: 13 }} /><YAxis dataKey="pace_change_pct" type="number" name="Late-race slowing" width={48} tickLine={false} axisLine={false} tick={{ fontSize: 13 }} tickFormatter={value => weatherNumber(value, 0) + '%'} /><ZAxis range={[44, 44]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
          const row = payload?.[0]?.payload as WeatherEdition | undefined;
          return active && row ? <div className="weather-tooltip"><strong>{row.city} · {row.year}</strong><p>{exposureHeading}: {weatherLabel(row[candidate.exposure.key], candidate.id, units)}</p><p>{weatherNumber(row.pace_change_pct)}% median slowing</p><p>{row.n.toLocaleString('en-US')} finishes</p></div> : null;
        }} /><Scatter data={chartRows} fill="#2346E6" fillOpacity={.65} isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div><p className="control-help">Vertical axis: median late-race slowing (%). Higher means more slowing. Each dot has the same size, regardless of field size.</p>
        <details className="table-disclosure"><summary>View race editions and values</summary><div className="table-scroll" role="region" aria-label="Weather and pacing values by race edition" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Race edition</th><th scope="col">{exposureHeading}</th><th scope="col">Late-race slowing</th><th scope="col">Finishes</th></tr></thead><tbody>{rows.map(row => <tr key={row.city + row.year}><th scope="row">{row.city} {row.year}</th><td>{weatherLabel(row[candidate.exposure.key], candidate.id, units)}</td><td>{weatherNumber(row.pace_change_pct, 2)}%</td><td>{row.n.toLocaleString('en-US')}</td></tr>)}</tbody></table></div></details>
      </section>
      <details className="analysis-method"><summary>How we calculated this</summary><div>{evidence.source_quality?.reviewed_edition_policy && <p>After checking the raw timings, we excluded {evidence.cohort.source_quality_excluded.toLocaleString('en-US')} otherwise plausible finishes from reviewed editions with invalid split grids, incomplete ingestion, unresolved source checks or a selected field. These source exclusions are reported separately from timing errors in the downloadable evidence.</p>}{evidence.methodology.map((paragraph, index) => <p key={index}>{unitText(paragraph, units)}</p>)}<p>Data: <a href={release}>{source}</a>. See the <UnitLink href="/about#data-coverage">marathons, years and recorded conditions</UnitLink>. <a href={archiveUrl}>Download all three screening results and edition values</a>. <a href="https://open-meteo.com/en/docs/historical-weather-api">Weather source definitions</a>.</p><p>All three weather questions were screened together. The download retains their estimates and uncertainty, including any that were too uncertain for a separate page.</p></div></details>
      <nav className="analysis-pagination" aria-label="Continue exploring"><UnitLink href="/analyses/race-day-weather"><span>← Start with temperature</span><strong>Cooler and warmer races</strong></UnitLink>{questions.filter(item => item.id !== candidate.id).map(item => <UnitLink href={weatherHref(item)} key={item.id}><span>Another weather question →</span><strong>{item.shortTitle}</strong></UnitLink>)}</nav>
    </article>
  </div>;
}
