'use client';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { unitText } from '@/lib/units';
import { findingText } from '@/lib/analysis-display';
import { sourceLabel, sourceReleaseHref } from '@/lib/data-source';
import { useEffect, useMemo, useState } from 'react';
import type { CityData, PersonalSummary } from '@/lib/personalized-types';
import { AGE_OPTIONS, GOAL_MIN, GOAL_MAX, type Profile } from '@/lib/personalized-catalog';
import { buildGuide, clock, count, parseMinutes, type GuideAnswer } from '@/lib/personalized';
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
  const visibleAnswer = definition.id === 'courses' && answer?.charts[0]?.rows.length
    ? 'Compare ' + answer.charts[0].rows.length + (answer.charts[0].rows.length === 1 ? ' course' : ' courses') + ' with enough results to show a meaningful range.'
    : answer ? findingText(answer, units) : '';
  return <div className="analysis-layout">
    <aside className="analysis-sidebar"><Link href="/analyses" className="sidebar-heading">The essential ten</Link><nav aria-label="The ten ranked analyses"><ol>{TEN_ANALYSES.map(item => <li key={item.id}><Link href={analysisHref(item) + search} aria-current={item.id === definition.id ? 'page' : undefined}><span>{String(item.rank).padStart(2, '0')}</span>{text(item.shortTitle)}</Link></li>)}</ol></nav><p>One question at a time.<br />Your comparisons travel with you.</p></aside>
    <article className="analysis-main">
      <header className="analysis-heading"><Link href="/analyses" className="eyebrow">Analysis {String(definition.rank).padStart(2, '0')} of 10 <span aria-hidden="true"> / </span> {definition.category}</Link><h1>{text(definition.title)}</h1><p>{text(definition.purpose)}</p></header>
      {['courses', 'weather', 'gains'].includes(definition.id) && <p className="coverage-notice"><strong>This comparison requires earlier results.</strong> {definition.id === 'gains' ? 'Personal improvement compares a finish with the fastest eligible finish in any strictly earlier year. One race cannot establish improvement.' : 'Finish change compares a result with the fastest eligible finish in the two strictly earlier calendar years.'} Leaving the earlier-time filter blank includes every eligible history group; it does not include finishes with no earlier benchmark.{definition.id === 'gains' && <> With one race, explore <Link href="/analyses/pacing-pattern">pacing patterns</Link> or <Link href="/runners">same-edition peers</Link>.</>}</p>}
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
          {definition.controls.time && <label>{['profile', 'terrain', 'gains', 'age'].includes(definition.id) ? 'Finish time to explore' : 'Target time'}<input value={timeText} onChange={event => setTimeText(event.target.value)} placeholder="4:00" spellCheck={false} aria-describedby="time-help" /></label>}
          {!definition.controls.course && <p className="control-help">This comparison spans every course with enough data. Refine the runners below.</p>}
          <button type="submit" className="button-primary">Update comparison <span aria-hidden="true">↗</span></button>
        </div>
        {definition.controls.time && <p className="control-help" id="time-help">Hours:minutes. {['profile', 'terrain', 'gains', 'age'].includes(definition.id) ? 'We compare a 15-minute band around this finish time.' : 'We count finishes strictly below this time.'}</p>}
        <details className="profile-refinements" open={refining} onToggle={event => setRefining(event.currentTarget.open)}><summary>Refine by {definition.controls.age ? 'age, ' : ''}gender{definition.controls.previous ? ' or earlier performance' : ''}</summary><div className="profile-fields">
          {definition.controls.age && <label>Age group<select value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></label>}
          <label>Recorded gender<select value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}><option value="all">All recorded categories</option><option value="Women">Women</option><option value="Men">Men</option></select></label>
          {definition.controls.previous && <label>Earlier marathon · optional<input value={previousText} onChange={event => setPreviousText(event.target.value)} placeholder="e.g. 4:15" spellCheck={false} /></label>}
        </div>{definition.controls.previous && <p className="control-help">An earlier time selects a 15-minute band of recorded bests from earlier years.{definition.id === 'age' ? ' When entered, that band replaces the achieved finish-time band.' : ''}</p>}</details>
        {formError && <p className="feedback-error" role="alert">{formError}</p>}
      </form>
      <div className="sr-only" role="status">{loading ? 'Loading your comparison.' : changed && answer ? 'Comparison updated. ' + (answer.comparison || '') : ''}</div>
      {loading ? <div className="analysis-loading" aria-hidden="true"><span /><span /><span /><div /></div> : error ? <div className="feedback-error" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)} type="button">Try loading again</button></div> : <>
        {definition.id === 'checkpoint' ? <CheckpointExplorer summary={summary} profile={profile} /> : needsCourse ? <section className="empty-comparison"><p className="eyebrow">Every course has its own shape</p><h2>Choose your marathon above.</h2><p>Elevation belongs to a particular course. Select a city to compare its supplied rises and falls with observed pacing.</p></section> : answer && <>
          <section className={'analysis-finding' + (!hasResults ? ' empty-comparison' : '')}><p className="eyebrow">{hasResults ? 'What the data shows' : 'This comparison needs more data'}</p><h2>{text(visibleAnswer)}</h2>{answer.detail && <p>{text(answer.detail)}</p>}{answer.comparison && <p className="comparison-context">{text(answer.comparison)}.{answer.sample ? ' ' + count(answer.sample.n) + ' finishes across ' + answer.sample.editions + (answer.sample.editions === 1 ? ' race edition.' : ' race editions.') : ' Each group shows its own sample size.'}</p>}{answer.widened && <p className="coverage-notice">{text(answer.widened)}</p>}{!hasResults && <button className="button-secondary" type="button" onClick={() => applyProfile(EXAMPLE_PROFILE)}>Explore the all-course example</button>}</section>
          {hasResults && <AnalysisChart charts={answer.charts} analysisId={definition.id + profileSearch(profile)} />}
        </>}
        {definition.id === 'weather' && weatherQuestions.length > 0 && <section className="weather-related"><p className="eyebrow">Look beyond the starting temperature</p><h2>Explore more weather questions.</h2><p>These comparisons use race editions as the unit of evidence. Each shows the included races and recorded conditions.</p><div>{weatherQuestions.map(item => <Link key={item.id} href={weatherHref(item)} className="text-link">{item.shortTitle} <span aria-hidden="true">↗</span></Link>)}</div></section>}
        <section className="analysis-reading"><div><h2>How to read this</h2><p>{text(definition.readChart)}</p></div><div><h2>Keep in mind</h2><p>{text(definition.caution)}</p></div></section>
        <details className="analysis-method"><summary>How we calculated this</summary><div><p>{text(answer?.method || initialAnswer.method)}</p><p>Runner comparison groups contain at least 100 eligible observations. Broader comparisons are labeled; a finish can belong to a runner with several races. Elevation describes the supplied course profile.</p><p>We check the raw timings and apply reviewed source-quality rules before forming these groups. Editions with known invalid split grids, incomplete ingestion, unresolved source checks or a selected field are excluded. Missing age or recorded gender alone does not remove an otherwise eligible finish from the overall comparison.</p><p>Input data: <a href={sourceReleaseHref(summary.export_id)}>{sourceLabel(summary.input_as_of, summary.export_id)}</a>. <Link href="/methodology#personalized">Read the full methods in source units</Link> or browse the <Link href="/about#data-coverage">marathons, years and data fields</Link>.</p></div></details>
      </>}
      <nav className="analysis-pagination" aria-label="Continue exploring">{previous ? <Link href={analysisHref(previous) + search}><span>← Previous question</span><strong>{text(previous.shortTitle)}</strong></Link> : <Link href="/analyses"><span>← Choose a question</span><strong>All ten analyses</strong></Link>}{next ? <Link href={analysisHref(next) + search}><span>Next question →</span><strong>{text(next.shortTitle)}</strong></Link> : <Link href="/analyses"><span>Back to the ten ↗</span><strong>Keep exploring</strong></Link>}</nav>
    </article>
  </div>;
}
