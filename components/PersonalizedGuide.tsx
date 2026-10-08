'use client';

import { useEffect, useMemo, useState } from 'react';
import { UnitLink as Link } from './UnitsProvider';
import QuestionViz from './QuestionViz';
import { BROADER_GUIDE } from '@/lib/broader-analysis-catalog';
import { AGE_OPTIONS, GOAL_PRESETS, type Profile, type Focus } from '@/lib/personalized-catalog';
import type { CityData, PersonalSummary, CheckpointData } from '@/lib/personalized-types';
import { buildGuide, checkpointResult, clock, count, defaultProfile, fmt, GUIDE_PACK, parseElapsed, parseMinutes, parseSection, percentUnder, type GuideAnswer } from '@/lib/personalized';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const cache = new Map<string, unknown>();
async function loadAggregate<T>(file: string, vintage: string, signal: AbortSignal): Promise<T> {
  if (!/^(city|checkpoint)_[0-9]{2,3}\.json$/.test(file)) throw new Error('This comparison file is not available.');
  const key = `${file}:${vintage}`;
  if (cache.has(key)) return cache.get(key) as T;
  const response = await fetch(`${basePath}/data/packs/${GUIDE_PACK}/tables/${file}?v=${encodeURIComponent(vintage)}`, { signal });
  if (!response.ok) throw new Error('The comparison could not load. Please try again.');
  const decoded: unknown = await response.json();
  cache.set(key, decoded);
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
  return decoded as T;
}

const priorities: Record<Focus, string[]> = {
  prepare: ['profile', 'opening', 'checkpoint'],
  choose: ['courses', 'ambition', 'weather'],
  review: ['sections', 'terrain', 'gains'],
};
const focusLabels: Record<Focus, string> = { prepare: 'Prepare for a race', choose: 'Choose a marathon', review: 'Understand a past result' };

function CheckpointComparison({ summary, profile }: { summary: PersonalSummary; profile: Profile }) {
  const [checkpoint, setCheckpoint] = useState(30);
  const [elapsedText, setElapsedText] = useState(() => clock(profile.goal * 60 * 30 / 42.195, true));
  const [sectionText, setSectionText] = useState('');
  const [submitted, setSubmitted] = useState<{ checkpoint: number; elapsed: number; section: number | null } | null>(null);
  const [data, setData] = useState<CheckpointData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const city = summary.cities.find(row => row.city === profile.city)!;
  useEffect(() => {
    if (!submitted) return;
    const controller = new AbortController(); let active = true;
    setData(null); setError('');
    loadAggregate<CheckpointData>(city.checkpoint_file, summary.as_of, controller.signal).then(value => {
      if (value.city !== city.city || !Array.isArray(value.rows)) throw new Error('This checkpoint comparison is not available.');
      if (active) setData(value);
    }).catch(e => { if (active && e.name !== 'AbortError') setError(e.message); });
    return () => { active = false; controller.abort(); };
  }, [city.city, city.checkpoint_file, summary.as_of, !!submitted, retry]);
  const currentData = data?.city === profile.city ? data : null;
  const result = currentData && submitted ? checkpointResult(currentData, profile, submitted.checkpoint, submitted.elapsed, submitted.section) : null;
  const remaining = submitted ? (profile.goal * 60 - submitted.elapsed) / (42.195 - submitted.checkpoint) : null;
  return <div className="checkpoint-comparison">
    <form className="guide-form" onSubmit={event => {
      event.preventDefault();
      const elapsed = parseElapsed(elapsedText), section = sectionText ? parseSection(sectionText) : null;
      if (elapsed === null || elapsed <= 0 || elapsed >= 12 * 3600) { setError('Enter an elapsed time such as 2:08:00.'); return; }
      if (sectionText && (section === null || section < 600 || section > 6000 || section > elapsed)) { setError('Enter the latest 5 km time as minutes:seconds, from 10:00 to 100:00 and below total elapsed time.'); return; }
      setError(''); setSubmitted({ checkpoint, elapsed, section });
    }}>
      <div className="guide-fields">
        <label>Checkpoint<select value={checkpoint} onChange={event => { const km = Number(event.target.value); setCheckpoint(km); setElapsedText(clock(profile.goal * 60 * km / 42.195, true)); }}>{[20, 30, 35].map(km => <option value={km} key={km}>{km} km</option>)}</select></label>
        <label>Elapsed time (h:mm:ss)<input value={elapsedText} onChange={event => setElapsedText(event.target.value)} aria-describedby="checkpoint-example" spellCheck={false} /></label>
        <label>Latest 5 km time (optional)<input value={sectionText} onChange={event => setSectionText(event.target.value)} placeholder="e.g. 21:30" spellCheck={false} /></label>
      </div>
      <p id="checkpoint-example" className="study-meta">An even-pace time is prefilled as an example. Replace it with your actual elapsed time.</p>
      <button type="submit" className="guide-submit">Compare this checkpoint</button>
    </form>
    {error && <div role="alert" className="guide-error"><p>{error}</p>{submitted && <button type="button" onClick={() => setRetry(x => x + 1)}>Try loading again</button>}</div>}
    {submitted && !currentData && !error && <p role="status" className="study-meta">Loading checkpoint comparisons…</p>}
    {currentData && submitted && !result && <p className="answer-state">Fewer than 100 complete finishes match this elapsed-time band, even after broadening age, gender and recent pace trend. Choose another course or checkpoint; no estimate is shown.</p>}
    {result && submitted && <div aria-live="polite">
      <p className="answer">{fmt(percentUnder(result.row, profile.goal))}% of these {count(result.row.n)} complete finishes were below {clock(profile.goal * 60)}. Their median finish was {clock(result.row.finish[1], true)}.</p>
      <p className="answer-detail">{remaining !== null && remaining > 0 ? `Reaching your target from the entered time requires ${Math.floor(Math.round(remaining) / 60)}:${String(Math.round(remaining) % 60).padStart(2, '0')}/km over the remaining ${fmt(42.195 - submitted.checkpoint)} km.` : 'The selected target time has already elapsed at this checkpoint.'} This historical group is not a calibrated personal prediction.</p>
      <p className="study-meta guide-coverage">{result.comparison}. {result.row.editions} race editions. Previous marathon time is not used in this checkpoint comparison.</p>
      {(result.widened || result.trendWidened) && <p className="study-meta guide-widened">{result.widened} {result.trendWidened && 'Recent pace trend was also broadened to all trends.'}</p>}
      <QuestionViz unitSystem="km" spec={{ title: 'Historical finish-time range', unit: 'finish', xLabel: 'Percentile', kind: 'bars', series: [{ key: 'value', label: 'Finish time' }], rows: ['10th percentile', 'Median', '90th percentile'].map((label, i) => ({ label, value: result.row.finish[i] / 60, n_value: result.row.n })), note: 'These percentiles show variation among complete eligible finishers, including repeated runners. Non-finishers and missing-split records are absent.' }} />
    </div>}
  </div>;
}

function Answer({ answer, number, summary, profile }: { answer: GuideAnswer; number: number; summary: PersonalSummary; profile: Profile }) {
  return <section className="question guide-question" id={`guide-${answer.id}`} aria-labelledby={`guide-title-${answer.id}`}>
    <span className="question-number">Personalized question {number} of 12</span>
    <h2 className="question-title" id={`guide-title-${answer.id}`}>{answer.title}</h2>
    {BROADER_GUIDE[answer.id] && <p className="coverage-notice"><Link href={BROADER_GUIDE[answer.id].href}>{BROADER_GUIDE[answer.id].label} ↗</Link>. This archived comparison below requires an earlier recorded result.</p>}
    {['gains', 'return'].includes(answer.id) && <p className="coverage-notice">This question measures change across races and requires linked results. With one race, explore <Link href="/runners">your pacing, conditions and same-edition peers</Link>.</p>}
    <p className="answer">{answer.answer}</p>
    <p className="answer-detail">{answer.detail}</p>
    {answer.comparison && <p className="study-meta guide-coverage">Comparison: {answer.comparison}.{answer.sample && ` ${count(answer.sample.n)} observations across ${answer.sample.editions} race editions.`}</p>}
    {answer.widened && <p className="study-meta guide-widened">{answer.widened}</p>}
    <details className="methodology"><summary>Methodology</summary><div className="methodology-content"><p>{answer.method}</p><p>Every published result contains at least 100 observations. Variation bands describe performances, not certainty in an estimate. Each answer labels its actual comparison group, including broader filters where needed.</p><Link href="/methodology#personalized">Full personalized methodology</Link></div></details>
    {answer.id === 'checkpoint' ? <CheckpointComparison summary={summary} profile={profile} /> : answer.charts.map((chart, i) => <QuestionViz key={`${answer.id}-${i}`} spec={chart} unitSystem="km" />)}
  </section>;
}

export default function PersonalizedGuide({ summary }: { summary: PersonalSummary }) {
  const initial = { ...defaultProfile, city: summary.cities.some(c => c.city === 'New York') ? 'New York' : summary.cities[0].city };
  const [profile, setProfile] = useState<Profile>(initial);
  const [draft, setDraft] = useState<Profile>(initial);
  const [goalText, setGoalText] = useState('3:00');
  const [customGoal, setCustomGoal] = useState(false);
  const [previousText, setPreviousText] = useState('');
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [data, setData] = useState<CityData | null>(null);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const city = summary.cities.find(c => c.city === profile.city)!;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cityParam = params.get('race') === 'NYC' ? 'New York' : params.get('race');
    const goal = Number(params.get('goal')), previous = Number(params.get('previous'));
    const restored: Profile = {
      city: summary.cities.some(c => c.city === cityParam) ? cityParam! : initial.city,
      age: AGE_OPTIONS.includes(params.get('age') || '') ? params.get('age')! : 'all',
      gender: ['Men', 'Women'].includes(params.get('gender') || '') ? params.get('gender')! : 'all',
      goal: Number.isInteger(goal) && goal >= 90 && goal <= 720 ? goal : 180,
      previous: params.has('previous') && Number.isInteger(previous) && previous >= 90 && previous <= 720 ? previous : null,
      focus: ['prepare', 'choose', 'review'].includes(params.get('focus') || '') ? params.get('focus') as Focus : 'prepare',
    };
    setProfile(restored); setDraft(restored); setGoalText(clock(restored.goal * 60)); setCustomGoal(!GOAL_PRESETS.includes(restored.goal)); setPreviousText(restored.previous === null ? '' : clock(restored.previous * 60));
    setOptionalOpen(restored.gender !== 'all' || restored.previous !== null);
  }, []);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setData(null); setLoadError('');
    loadAggregate<CityData>(city.file, summary.as_of, controller.signal).then(value => {
      if (value.city !== city.city || !value.cohorts) throw new Error('This course comparison is not available.');
      if (active) setData(value);
    }).catch(e => { if (active && e.name !== 'AbortError') setLoadError(e.message); });
    return () => { active = false; controller.abort(); };
  }, [city.city, city.file, summary.as_of, retry]);

  const answers = useMemo(() => {
    if (!data || data.city !== profile.city) return [];
    const all = buildGuide(data, summary, profile), top = priorities[profile.focus];
    return [...top.map(id => all.find(answer => answer.id === id)!), ...all.filter(answer => !top.includes(answer.id))];
  }, [data, summary, profile]);

  useEffect(() => {
    if (!answers.length) return;
    const hash = window.location.hash.slice(1);
    if (answers.some(answer => `guide-${answer.id}` === hash)) document.getElementById(hash)?.scrollIntoView();
  }, [answers.length]);

  return <article className="personalized-guide">
    <header className="guide-intro"><h1>Your race, in context.</h1><p>12 questions for your course, age and time, drawn from {count(summary.n)} eligible finishes.</p></header>
    <form className="guide-profile guide-form" onSubmit={event => {
      event.preventDefault();
      const goal = parseMinutes(goalText), previous = previousText.trim() ? parseMinutes(previousText) : null;
      if (goal === null || goal < 90 || goal > 720) { setFormError('Enter a target from 1:30 to 12:00 in hours:minutes, such as 2:57.'); return; }
      if (previousText.trim() && (previous === null || previous < 90 || previous > 720)) { setFormError('Enter the earlier marathon time as hours:minutes, such as 3:10, or leave it blank.'); return; }
      const next = { ...draft, goal, previous }; setProfile(next); setDraft(next); setFormError('');
      const params = new URLSearchParams({ race: next.city, age: next.age, goal: String(goal), gender: next.gender, focus: next.focus });
      if (previous !== null) params.set('previous', String(previous));
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    }}>
      <div className="guide-fields">
        <label>Marathon<select value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })}>{summary.cities.map(c => <option key={c.city} value={c.city}>{c.city === 'New York' ? 'New York City' : c.city}</option>)}</select></label>
        <label>I want to…<select value={draft.focus} onChange={event => setDraft({ ...draft, focus: event.target.value as Focus })}>{Object.entries(focusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label>{draft.focus === 'review' ? 'Time to compare' : 'Target time'}<select value={customGoal ? 'custom' : String(parseMinutes(goalText))} onChange={event => { setCustomGoal(event.target.value === 'custom'); if (event.target.value !== 'custom') setGoalText(clock(Number(event.target.value) * 60)); }}><option value="custom">Custom time</option>{GOAL_PRESETS.map(goal => <option value={goal} key={goal}>Sub-{clock(goal * 60)}</option>)}</select></label>
        {customGoal && <label>Custom time (h:mm)<input value={goalText} onChange={event => setGoalText(event.target.value)} placeholder="e.g. 2:57" aria-describedby="guide-target-note" spellCheck={false} /></label>}
        <label>Age group<select value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></label>
      </div>
      <details className="guide-optional" open={optionalOpen} onToggle={event => setOptionalOpen(event.currentTarget.open)}><summary>Optional: gender and previous marathon</summary><div className="guide-fields">
        <label>Gender<select value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}><option value="all">All recorded categories</option><option value="Men">Men</option><option value="Women">Women</option></select></label>
        <label>Previous marathon (h:mm)<input value={previousText} onChange={event => setPreviousText(event.target.value)} placeholder="e.g. 3:10" aria-describedby="guide-previous-note" spellCheck={false} /></label>
      </div><p className="study-meta" id="guide-previous-note">An earlier time selects a 15-minute band of recorded bests from earlier years. Leave it blank for broader field comparisons.</p></details>
      <p className="study-meta" id="guide-target-note">Targets are comparison thresholds. Historical runners’ declared goals are unknown.</p>
      {formError && <p role="alert" className="guide-error">{formError}</p>}
      <button className="guide-submit" type="submit">Update my comparisons</button>
    </form>
    <p className="guide-selection" aria-live="polite">{profile.city} · {profile.age === 'all' ? 'all ages' : `age ${profile.age}`} · sub-{clock(profile.goal * 60)} · {profile.gender === 'all' ? 'all recorded categories' : profile.gender}{profile.previous !== null && ` · previous marathon ${clock(profile.previous * 60)}`}</p>
    <p className="study-meta">{focusLabels[profile.focus]}: the three most relevant questions appear first. Each answer identifies its actual comparison group and any broader filters used.</p>
    {loadError ? <div className="guide-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => setRetry(x => x + 1)}>Try again</button></div> : !answers.length ? <p role="status" className="answer-state">Loading comparisons for {profile.city}…</p> : <>
      <details className="question-index guide-index"><summary>Explore all 12 personalized questions</summary><ol className="contents-list">{answers.map((answer, i) => <li key={answer.id}><a href={`#guide-${answer.id}`}><span className="contents-number">{i + 1}</span><span>{answer.title}</span></a></li>)}</ol></details>
      <div className="question-list">{answers.map((answer, i) => <Answer key={answer.id} answer={answer} number={i + 1} summary={summary} profile={profile} />)}</div>
    </>}
    <p className="guide-source study-meta">Marathon results with recorded splits, weather and supplied course profiles. <a href={`${basePath}/data/packs/${GUIDE_PACK}/pack_meta.json`}>Coverage and calculation details</a>. Historical route validity and runners’ declared goals are unavailable.</p>
    <p><Link href="/packs">Explore the broader research archive</Link></p>
  </article>;
}
