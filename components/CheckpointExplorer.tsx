'use client';
import { useEffect, useId, useState } from 'react';
import type { Profile } from '@/lib/personalized-catalog';
import { AGE_OPTIONS, GOAL_MAX, GOAL_MIN } from '@/lib/personalized-catalog';
import type { CheckpointData, CheckpointRow, PersonalSummary } from '@/lib/personalized-types';
import { checkpointResult, clock, parseElapsed, parseMinutes, parseSection, percentUnder } from '@/lib/personalized';
import { loadAnalysisAggregate } from '@/lib/analysis-aggregates';
import { EXAMPLE_PROFILE, profileSearch, readAnalysisProfile } from '@/lib/analysis-profile';
import { keypadInput } from '@/lib/keypad';
import { paceLabel } from '@/lib/units';
import { useUnits } from './UnitsProvider';
import KeypadHint from './KeypadHint';
import MakeItYours from './ui/MakeItYours.client';
import Ruler from './viz/Ruler';
import { AnswerAbove, ExploreSubmit } from './analysis/ExploreSubmit';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';

const cityName = (city: string) => city === 'New York' ? 'New York City' : city;
const MATS = [20, 30, 35];
type Request = { checkpoint: number; elapsed: number; section: number | null };
type Result = { row: CheckpointRow; widened: string; trendWidened: boolean };

/**
 * The checkpoint explorer (Make it yours, the redesign spec, section 7.6): the course, the goal, the mat, the time on the
 * clock there and, optionally, the latest 5 km and the refinements, in one form (a sheet under 900 px, inline from
 * 900 px). It opens pre-filled with even goal pace at 30K, the example the page's answer reads, so until the visitor
 * changes something it shows only its selection row (the page never repeats the answer); anything else loads its
 * course's published checkpoint file.
 */
export default function CheckpointExplorer({ summary, profile: start = EXAMPLE_PROFILE, initial }: {
  summary: PersonalSummary; profile?: Profile;
  /** The result the page opens on: even goal pace at 30K for all courses, every age and recorded gender. */
  initial?: { row: CheckpointRow; checkpoint: number; elapsed: number } | null;
}) {
  const { units } = useUnits();
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const evenAt = (goal: number, km: number) => Math.round(goal * 60 * km / 42.195);
  const [profile, setProfile] = useState<Profile>(start);
  const [draft, setDraft] = useState<Profile>(start);
  const [goalText, setGoalText] = useState(clock(start.goal * 60));
  const [checkpoint, setCheckpoint] = useState(initial?.checkpoint ?? 30);
  const [elapsedText, setElapsedText] = useState(clock(initial?.elapsed ?? evenAt(start.goal, 30), true));
  const [sectionText, setSectionText] = useState('');
  const [request, setRequest] = useState<Request>({ checkpoint: initial?.checkpoint ?? 30, elapsed: initial?.elapsed ?? evenAt(start.goal, 30), section: null });
  const [data, setData] = useState<CheckpointData | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  // The visitor (or the address) chose a selection: the example set again then reads as the answer above.
  const [chosen, setChosen] = useState(false);
  const isInitial = !!initial && profile.city === start.city && profile.age === 'all' && profile.gender === 'all' && profile.goal === start.goal
    && request.checkpoint === initial.checkpoint && request.elapsed === initial.elapsed && request.section === null;
  const city = summary.cities.find(row => row.city === profile.city) ?? summary.cities[0];
  useEffect(() => {
    const restore = () => {
      const read = readAnalysisProfile(window.location.search, summary);
      setProfile(read); setDraft(read); setGoalText(clock(read.goal * 60));
      const mat = Number(new URLSearchParams(window.location.search).get('mat'));
      const km = MATS.includes(mat) ? mat : 30;
      const elapsed = parseElapsed(new URLSearchParams(window.location.search).get('at') || '') ?? evenAt(read.goal, km);
      setCheckpoint(km); setElapsedText(clock(elapsed, true)); setSectionText(''); setRequest({ checkpoint: km, elapsed, section: null });
      const query = new URLSearchParams(window.location.search); query.delete('units'); setChosen(query.toString() !== '');
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [summary]);
  useEffect(() => {
    if (isInitial) { setLoading(false); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    loadAnalysisAggregate<CheckpointData>(city.checkpoint_file, city.city, summary.as_of, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setData(value); setLoading(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [isInitial, city.city, city.checkpoint_file, summary.as_of, retry]);
  const result: Result | null = isInitial && initial ? { row: initial.row, widened: '', trendWidened: false }
    : data?.city === profile.city ? checkpointResult(data, profile, request.checkpoint, request.elapsed, request.section) : null;
  const share = result ? percentUnder(result.row, profile.goal) : null;
  const remaining = (profile.goal * 60 - request.elapsed) / (42.195 - request.checkpoint);
  const field = (key: string) => `${formId}-${key}`;
  // The mat and its split, then only the choices that differ from the example (never the default goal or "All courses").
  const summaryText = [`${request.checkpoint}K in ${clock(request.elapsed, true)}`, ...(profile.goal === start.goal ? [] : [`goal ${clock(profile.goal * 60)}`]), ...(profile.city === start.city ? [] : [cityName(profile.city)]), ...(profile.age === 'all' ? [] : [profile.age]), ...(profile.gender === 'all' ? [] : [profile.gender])].join(' · ');
  // The form as typed: Update comparison does something only once it differs from the result on screen (a time that does
  // not parse counts as a change, so its message shows).
  const typedGoal = parseMinutes(goalText), typedElapsed = parseElapsed(elapsedText), typedSection = sectionText.trim() ? parseSection(sectionText) : null;
  const ready = typedGoal === null || typedElapsed === null || (!!sectionText.trim() && typedSection === null) || typedGoal !== profile.goal || draft.city !== profile.city || draft.age !== profile.age
    || draft.gender !== profile.gender || checkpoint !== request.checkpoint || typedElapsed !== request.elapsed || typedSection !== request.section;
  const submit = () => {
    if (!ready) return;
    const goal = typedGoal, elapsed = typedElapsed, section = typedSection;
    if (goal === null || goal < GOAL_MIN || goal > GOAL_MAX) { setFormError('Enter a goal between ' + clock(GOAL_MIN * 60) + ' and ' + clock(GOAL_MAX * 60) + ', using hours:minutes.'); return; }
    if (elapsed === null || elapsed <= 0 || elapsed >= 12 * 3600) { setFormError('Enter your elapsed time as hours:minutes:seconds, for example 2:50:00.'); return; }
    if (sectionText.trim() && (section === null || section < 600 || section > 6000 || section > elapsed)) { setFormError('Enter a 5 km time between 10:00 and 100:00, shorter than the total elapsed time.'); return; }
    const next = { ...draft, goal };
    trackAnalytics('analysis_filters_applied', { analysis: 'checkpoint', course_scope: next.city === 'All courses' ? 'all' : 'single' });
    setFormError(''); setProfile(next); setData(prev => (prev?.city === next.city ? prev : null)); setRequest({ checkpoint, elapsed, section }); setChosen(true);
    window.history.pushState(null, '', unitHref(`${window.location.pathname}${profileSearch(next)}&mat=${checkpoint}&at=${clock(elapsed, true)}`, units));
  };
  const lo = result ? result.row.finish[0] / 60 : 0, hi = result ? result.row.finish[2] / 60 : 0;
  const t0 = Math.floor(Math.min(lo, profile.goal) / 10) * 10, t1 = Math.ceil(Math.max(hi, profile.goal) / 10) * 10;
  const step = t1 - t0 > 60 ? 20 : 10;
  return <div className="analysis-layout explorer checkpoint-explorer">
    <MakeItYours id={`${formId}-miy`} summary={summaryText} busy={loading}>
      <form className="explore-form" onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="explore-fields">
          <div className="field"><label className="field-label" htmlFor={field('course')}>Course</label><select id={field('course')} className="select" value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })}>{summary.cities.map(row => <option key={row.city} value={row.city}>{cityName(row.city)}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor={field('goal')}>Target time</label><input id={field('goal')} className="input" value={goalText} onChange={event => setGoalText(keypadInput(event.target, event.nativeEvent))} placeholder="4:00" inputMode="decimal" spellCheck={false} autoComplete="off" /></div>
          <div className="field"><label className="field-label" htmlFor={field('mat')}>Checkpoint</label><select id={field('mat')} className="select" value={checkpoint} onChange={event => { const km = Number(event.target.value); setCheckpoint(km); setElapsedText(clock(evenAt(parseMinutes(goalText) ?? profile.goal, km), true)); }}>{MATS.map(km => <option key={km} value={km}>{km}K</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor={field('elapsed')}>Elapsed time</label><input id={field('elapsed')} className="input" value={elapsedText} onChange={event => setElapsedText(keypadInput(event.target, event.nativeEvent))} placeholder="2:50:00" inputMode="decimal" spellCheck={false} autoComplete="off" aria-describedby={field('elapsed-help')} /><p className="field-hint" id={field('elapsed-help')}>Hours:minutes:seconds.<KeypadHint /></p></div>
        </div>
        <details className="guide-optional profile-refinements"><summary>Add your latest 5 km, age or gender</summary>
          <div className="explore-fields">
            <div className="field"><label className="field-label" htmlFor={field('section')}>Latest 5 km · optional</label><input id={field('section')} className="input" value={sectionText} onChange={event => setSectionText(keypadInput(event.target, event.nativeEvent))} placeholder="e.g. 28:00" inputMode="decimal" spellCheck={false} autoComplete="off" /></div>
            <div className="field"><label className="field-label" htmlFor={field('age')}>Age group</label><select id={field('age')} className="select" value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></div>
            <div className="field"><label className="field-label" htmlFor={field('gender')}>Recorded gender</label><select id={field('gender')} className="select" value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}><option value="all">All</option><option value="Women">Women</option><option value="Men">Men</option></select></div>
          </div>
        </details>
        {formError && <p className="field-error" role="alert">{formError}</p>}
        <ExploreSubmit ready={ready} id={formId} />
      </form>
    </MakeItYours>
    <div className="sr-only" role="status">{loading ? 'Loading the checkpoint comparison.' : chosen && result ? `Comparison updated: ${summaryText}.` : ''}</div>
    <div className="miy-results">
      {loading && !result ? <p className="explore-state">Loading the checkpoint comparison…</p>
        : error ? <div className="explore-state" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary is-compact" onClick={() => setRetry(n => n + 1)}>Try again</button></div>
        // The page's answer and its cushion beat already read the example: until the visitor changes it, the explorer is
        // its selection row alone.
        : isInitial ? (chosen ? <AnswerAbove /> : null)
        : !result ? <div className="explore-state"><h2 className="explore-title">Too few comparable finishes.</h2><p>Try another elapsed time or All courses.</p></div>
        : <div className="explore-results">
          <h2 className="explore-title">At {request.checkpoint}K in {clock(request.elapsed, true)}, {share === null ? 'the share' : `${Math.round(share)}%`} of finishes got under {clock(profile.goal * 60)}.</h2>
          {(result.widened || result.trendWidened) && <p className="explore-note">{result.widened} {result.trendWidened ? 'The recent pace trend was broadened to every trend.' : ''}</p>}
          <dl className="explore-cells">
            <div><dt>Median finish</dt><dd>{clock(result.row.finish[1], true)}</dd></div>
            <div><dt>Middle 80% of finishes</dt><dd>{clock(result.row.finish[0])}–{clock(result.row.finish[2])}</dd></div>
            <div><dt>Pace for {clock(profile.goal * 60)} from here</dt><dd>{remaining > 0 ? paceLabel(remaining, units) : 'Already past'}</dd></div>
          </dl>
          <Ruler min={t0} max={t1} ticks={Array.from({ length: Math.round((t1 - t0) / step) + 1 }, (_, i) => t0 + i * step).map(v => ({ value: v, label: clock(v * 60) }))}
            marks={[{ value: result.row.finish[1] / 60, kind: 'compare', label: `Median ${clock(result.row.finish[1])}` }, { value: profile.goal, kind: 'you', label: `Goal ${clock(profile.goal * 60)}` }]}
            label={`Finishes from ${request.checkpoint}K in ${clock(request.elapsed, true)}: median ${clock(result.row.finish[1], true)}, the middle 80% from ${clock(result.row.finish[0])} to ${clock(result.row.finish[2])}; the goal is ${clock(profile.goal * 60)}`} />
        </div>}
    </div>
  </div>;
}
