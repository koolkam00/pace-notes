'use client';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { unitText, type UnitSystem } from '@/lib/units';
import { findingText } from '@/lib/analysis-display';
import { useEffect, useMemo, useState } from 'react';
import type { CityData, PersonalSummary } from '@/lib/personalized-types';
import { AGE_OPTIONS, GOAL_MIN, GOAL_MAX, type Profile } from '@/lib/personalized-catalog';
import { buildGuide, clock, parseMinutes, type GuideAnswer } from '@/lib/personalized';
import { keypadInput } from '@/lib/keypad';
import { TEN_ANALYSES, analysisHref, type AnalysisDefinition } from '@/lib/ten-analyses';
import { EXAMPLE_PROFILE, profileSearch, readAnalysisProfile, sameProfile } from '@/lib/analysis-profile';
import { loadAnalysisAggregate } from '@/lib/analysis-aggregates';
import AnalysisChart from './AnalysisChart';
import CheckpointExplorer from './CheckpointExplorer';
import { trackAnalytics } from '@/lib/analytics';
import { dropDefaults, unitHref } from '@/lib/unit-preference';
import { weatherHref } from '@/lib/weather-catalog';
import type { WeatherDefinition } from '@/lib/weather-types';

const EMPTY_CITY: CityData = { city: 'All courses', cohorts: {}, terrain: [] };
const one = (value: number) => Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
/** A % pace or finish change in words: "2.1% faster", "3.4% slower", "about the same". */
const change = (value: number) => Math.abs(value) < 0.05 ? 'about the same' : `${one(value)}% ${value < 0 ? 'faster' : 'slower'}`;
type Row = { label: string; value: number };
const extremes = (rows: Row[]) => rows.reduce((range, row) => ({ low: row.value < range.low.value ? row : range.low, high: row.value > range.high.value ? row : range.high }), { low: rows[0], high: rows[0] });

/**
 * The headline for comparisons whose stored answer only says what can be compared: state what the chart shows instead.
 * Read from the chart rows on screen, so it always matches them. Returns '' to keep the stored answer.
 */
function insightHeadline(id: string, answer: GuideAnswer, goal: number, units: UnitSystem): string {
  const chart = answer.charts[0];
  if (!chart?.rows.length) return '';
  const rows = (key: string) => chart.rows.map(row => ({ label: String(row.label).replace(' (selected)', ''), value: Number(row[key]) })).filter(row => Number.isFinite(row.value));
  if (id === 'courses' || id === 'weather') {
    const values = rows('value');
    if (!values.length) return '';
    const what = id === 'courses' ? 'courses' : 'start temperatures';
    if (values.length === 1) return `The median finish was ${change(values[0].value)} ${Math.abs(values[0].value) < 0.05 ? 'as' : 'than'} the same runners’ earlier best.`;
    const { low, high } = extremes(values);
    // Courses are not named: one course at the top of the range is not a ranking of course difficulty.
    return id === 'courses' ? `Across ${values.length} ${what}, median finishes ranged from ${change(low.value)} to ${change(high.value)} than the same runners’ earlier bests.`
      : `Across ${values.length} ${what}, median finishes ranged from ${change(low.value)} (${low.label}) to ${change(high.value)} (${high.label}) than the same runners’ earlier bests.`;
  }
  if (id === 'age') {
    const values = rows('value');
    if (values.length < 2) return '';
    const { low, high } = extremes(values);
    return unitText(`Across ${values.length} age groups, the second 20 km ranged from ${change(low.value)} (${low.label}) to ${change(high.value)} (${high.label}) than the first.`, units);
  }
  if (id === 'sections') {
    const gaps = chart.rows.map(row => ({ label: String(row.label), value: Number(row.above) - Number(row.below) })).filter(row => Number.isFinite(row.value));
    if (!gaps.length) return '';
    const { high } = extremes(gaps);
    if (high.value < 0.05) return '';
    return unitText(`The two groups split most in the ${high.label} section, where finishes just over ${clock(goal * 60)} took ${one(high.value)} min more than those just under.`, units);
  }
  return '';
}

export default function AnalysisExplorer({ definition, summary, initialAnswer, weatherQuestions = [], historyMode = false }: { definition: AnalysisDefinition; summary: PersonalSummary; initialAnswer: GuideAnswer; weatherQuestions?: WeatherDefinition[]; historyMode?: boolean }) {
  const { units } = useUnits();
  const text = (value: string | undefined) => unitText(value || '', units);
  const [profile, setProfile] = useState<Profile>(EXAMPLE_PROFILE);
  const [draft, setDraft] = useState<Profile>(EXAMPLE_PROFILE);
  const [timeText, setTimeText] = useState('4:00');
  const [previousText, setPreviousText] = useState('');
  const [data, setData] = useState<CityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [retry, setRetry] = useState(0);
  const [changed, setChanged] = useState(false);
  const [refining, setRefining] = useState(false);
  const city = summary.cities.find(row => row.city === profile.city)!;
  const usesCityData = definition.id !== 'courses' && definition.id !== 'checkpoint' && !(definition.id === 'terrain' && profile.city === 'All courses');
  const setSelection = (next: Profile) => {
    setProfile(next); setDraft(next); setTimeText(clock(next.goal * 60)); setPreviousText(next.previous === null ? '' : clock(next.previous * 60));
    setRefining(next.age !== 'all' || next.gender !== 'all' || next.previous !== null);
  };
  useEffect(() => {
    // units=km alone is not a comparison: a kilometres visitor arriving from a link still starts with the example.
    const restore = () => { const query = new URLSearchParams(window.location.search); query.delete('units'); setSelection(readAnalysisProfile(window.location.search, summary)); setChanged(query.toString() !== ''); setFormError(''); };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [summary]);
  useEffect(() => {
    if (!usesCityData || sameProfile(profile, EXAMPLE_PROFILE)) { setLoading(false); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    loadAnalysisAggregate<CityData>(city.file, city.city, summary.as_of, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setData(value); setLoading(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [city.file, city.city, summary.as_of, profile, retry, usesCityData]);
  const answer = useMemo(() => {
    if (definition.id === 'courses' || definition.id === 'checkpoint') return buildGuide(EMPTY_CITY, summary, profile).find(item => item.id === definition.id)!;
    if (sameProfile(profile, EXAMPLE_PROFILE)) return initialAnswer;
    if (data?.city !== profile.city) return null;
    return buildGuide(data, summary, profile).find(item => item.id === definition.id)!;
  }, [data, profile, summary, definition.id, initialAnswer]);
  const needsCourse = definition.id === 'terrain' && profile.city === 'All courses';
  const hasResults = !!answer?.charts.length && !needsCourse;
  const previous = TEN_ANALYSES[definition.rank - 2], next = TEN_ANALYSES[definition.rank];
  // Links to the other analyses carry the visitor's comparison, minus filters left at every course/age/gender; the example needs no query. UnitLink adds units=km.
  const search = sameProfile(profile, EXAMPLE_PROFILE) ? '' : dropDefaults(profileSearch(profile));
  const applyProfile = (nextProfile: Profile) => {
    trackAnalytics('analysis_filters_applied', { analysis: definition.id, course_scope: nextProfile.city === 'All courses' ? 'all' : 'single' });
    setSelection(nextProfile); setChanged(true); setFormError('');
    window.history.pushState(null, '', unitHref(window.location.pathname + profileSearch(nextProfile) + (historyMode ? '&comparison=history' : ''), units));
  };
  const visibleAnswer = answer ? insightHeadline(definition.id, answer, profile.goal, units) || findingText(answer, units) : '';
  return <div className="analysis-layout">
    <aside className="analysis-sidebar"><Link href="/analyses" className="sidebar-heading">The essential ten</Link><nav aria-label="The ten ranked analyses"><ol>{TEN_ANALYSES.map(item => <li key={item.id}><Link href={analysisHref(item) + search} aria-current={item.id === definition.id ? 'page' : undefined}><span>{String(item.rank).padStart(2, '0')}</span>{text(item.shortTitle)}</Link></li>)}</ol></nav><p>One question at a time.<br />Your comparisons travel with you.</p></aside>
    <article className="analysis-main">
      <header className="analysis-heading"><Link href="/analyses" className="eyebrow">Analysis {String(definition.rank).padStart(2, '0')} of 10 <span aria-hidden="true"> / </span> {definition.category}</Link><h1>{text(definition.title)}</h1><p>{text(definition.dek)}</p></header>
      <form className="comparison-controls" onSubmit={event => {
        event.preventDefault();
        const goal = definition.controls.time ? parseMinutes(timeText) : draft.goal;
        const earlier = definition.controls.previous ? (previousText.trim() ? parseMinutes(previousText) : null) : draft.previous;
        if (goal === null || goal < GOAL_MIN || goal > GOAL_MAX) { setFormError('Enter a time between ' + clock(GOAL_MIN * 60) + ' and ' + clock(GOAL_MAX * 60) + ', using hours:minutes.'); return; }
        if (previousText.trim() && definition.controls.previous && (earlier === null || earlier < 90 || earlier > 720)) { setFormError('Enter your earlier marathon time in hours:minutes, or leave it blank.'); return; }
        applyProfile({ ...draft, goal, previous: earlier });
      }}>
        <div className="controls-heading"><h2>Make the comparison yours</h2><span>{changed ? 'Your selection' : 'Start with an example'}</span></div>
        <div className="profile-fields primary-profile-fields">
          {definition.controls.course && <label>Course<select value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })}>{summary.cities.map(row => <option key={row.city} value={row.city}>{row.city === 'All courses' && definition.id === 'terrain' ? 'Choose a course' : row.city === 'New York' ? 'New York City' : row.city}</option>)}</select></label>}
          {definition.controls.time && <label>{['profile', 'terrain', 'gains', 'age'].includes(definition.id) ? 'Finish time to explore' : 'Target time'}<input value={timeText} onChange={event => setTimeText(keypadInput(event.target, event.nativeEvent))} placeholder="4:00" spellCheck={false} aria-describedby="time-help" /></label>}
          {!definition.controls.course && <p className="control-help">Every course is included. Refine the runners below.</p>}
          <button type="submit" className="button-primary">Update comparison <span aria-hidden="true">↗</span></button>
        </div>
        {definition.controls.time && <p className="control-help" id="time-help">Hours:minutes.</p>}
        <details className="profile-refinements" open={refining} onToggle={event => setRefining(event.currentTarget.open)}><summary>Refine by {definition.controls.age ? 'age, ' : ''}gender{definition.controls.previous ? ' or earlier performance' : ''}</summary><div className="profile-fields">
          {definition.controls.age && <label>Age group<select value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></label>}
          <label>Recorded gender<select value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}><option value="all">All recorded categories</option><option value="Women">Women</option><option value="Men">Men</option></select></label>
          {definition.controls.previous && <label>Earlier marathon · optional<input value={previousText} onChange={event => setPreviousText(keypadInput(event.target, event.nativeEvent))} placeholder="e.g. 4:15" spellCheck={false} /></label>}
        </div></details>
        {formError && <p className="feedback-error" role="alert">{formError}</p>}
      </form>
      <div className="sr-only" role="status">{loading ? 'Loading your comparison.' : changed && answer ? 'Comparison updated. ' + (answer.comparison || '') : ''}</div>
      {loading ? <div className="analysis-loading" aria-hidden="true"><span /><span /><span /><div /></div> : error ? <div className="feedback-error" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)} type="button">Try loading again</button></div> : <>
        {definition.id === 'checkpoint' ? <CheckpointExplorer summary={summary} profile={profile} /> : needsCourse ? <section className="empty-comparison"><p className="eyebrow">Every course has its own shape</p><h2>Choose your marathon above.</h2><p>Elevation belongs to a particular course. Select a city to see its rises and falls beside its pacing.</p></section> : answer && <>
          <section className={'analysis-finding' + (!hasResults ? ' empty-comparison' : '')}><p className="eyebrow">{hasResults ? 'What the data shows' : 'This comparison needs more data'}</p><h2>{text(visibleAnswer)}</h2>{answer.widened && <p className="coverage-notice">{text(answer.widened)}</p>}{!hasResults && <p>Try All courses, fewer refinements or another finish time.</p>}{!hasResults && <button className="button-secondary" type="button" onClick={() => applyProfile(EXAMPLE_PROFILE)}>Explore the all-course example</button>}</section>
          {hasResults && <AnalysisChart charts={answer.charts} analysisId={definition.id + profileSearch(profile)} />}
        </>}
        {definition.id === 'weather' && weatherQuestions.length > 0 && <section className="weather-related"><p className="eyebrow">Look beyond the starting temperature</p><h2>Explore more weather questions.</h2><div>{weatherQuestions.map(item => <Link key={item.id} href={weatherHref(item)} className="text-link">{item.shortTitle} <span aria-hidden="true">↗</span></Link>)}</div></section>}
      </>}
      <nav className="analysis-pagination" aria-label="Continue exploring">{previous ? <Link href={analysisHref(previous) + search}><span>← Previous question</span><strong>{text(previous.shortTitle)}</strong></Link> : <Link href="/analyses"><span>← Choose a question</span><strong>All ten analyses</strong></Link>}{next ? <Link href={analysisHref(next) + search}><span>Next question →</span><strong>{text(next.shortTitle)}</strong></Link> : <Link href="/analyses"><span>Back to the ten ↗</span><strong>Keep exploring</strong></Link>}</nav>
    </article>
  </div>;
}
