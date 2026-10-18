'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { useUnits } from './UnitsProvider';
import { unitText, type UnitSystem } from '@/lib/units';
import { findingText } from '@/lib/analysis-display';
import type { CityData, PersonalSummary } from '@/lib/personalized-types';
import { AGE_OPTIONS, GOAL_MIN, GOAL_MAX, type Profile } from '@/lib/personalized-catalog';
import { buildGuide, clock, parseMinutes, type GuideAnswer } from '@/lib/personalized';
import { keypadInput } from '@/lib/keypad';
import { type AnalysisDefinition } from '@/lib/ten-analyses';
import { EXAMPLE_PROFILE, profileSearch, readAnalysisProfile, sameProfile } from '@/lib/analysis-profile';
import { loadAnalysisAggregate } from '@/lib/analysis-aggregates';
import { MARATHON_SECTION_ENDS, sectionLabel } from '@/lib/section-labels';
import AnalysisChart from './AnalysisChart';
import KeypadHint from './KeypadHint';
import MakeItYours from './ui/MakeItYours.client';
import ExplorerChart, { wholeElevation, type TerrainExtras } from './analysis/ExplorerChart';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';

const one = (value: number) => Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
/** A % pace or finish change in words: "2.1% faster", "3.4% slower", "about the same". */
const change = (value: number) => Math.abs(value) < 0.05 ? 'about the same' : `${one(value)}% ${value < 0 ? 'faster' : 'slower'}`;
const cityName = (city: string) => city === 'New York' ? 'New York City' : city;
type Row = { label: string; value: number };
const extremes = (rows: Row[]) => rows.reduce((range, row) => ({ low: row.value < range.low.value ? row : range.low, high: row.value > range.high.value ? row : range.high }), { low: rows[0], high: rows[0] });

/**
 * The headline for comparisons whose stored answer only says what can be compared: state what the chart shows instead.
 * Read from the chart rows on screen, so it always matches them. Returns '' to keep the stored answer. Pinned by
 * verify-ten-analyses: "…split most in the 35–40K section…" and "Across N age groups, the second 20K ranged from …".
 */
export function insightHeadline(id: string, answer: GuideAnswer, goal: number, units: UnitSystem, city = ''): string {
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
    return `Across ${values.length} age groups, the second 20K ranged from ${change(low.value)} (${low.label}) to ${change(high.value)} (${high.label}) than the first.`;
  }
  if (id === 'sections') {
    const gaps = chart.rows.map(row => ({ label: String(row.label), value: Number(row.above) - Number(row.below) })).filter(row => Number.isFinite(row.value));
    if (!gaps.length) return '';
    const { high } = extremes(gaps);
    if (high.value < 0.05) return '';
    const gap = Math.round(high.value * 60);
    return `The two groups split most in the ${high.label} section, where finishes just over ${clock(goal * 60)} took ${Math.floor(gap / 60)}:${String(gap % 60).padStart(2, '0')} more than those just under.`;
  }
  if (id === 'profile') {
    // The shape, as the page's H1 says it (fast early, slow late against even pace); the chart's readout gives the paces.
    const p = rows('value'), even = goal / 42.195;
    if (p.length < 2) return '';
    const fast = Math.min(...p.map(r => r.value)), slow = Math.max(...p.map(r => r.value));
    if (!(fast < even && slow > even)) return '';
    const per = (minPerKm: number) => `${Math.round(Math.abs(minPerKm) * 60 * (units === 'mi' ? 1.609344 : 1))} s/${units}`;
    return `Finishes near ${clock(goal * 60)} ran ${per(even - fast)} fast early and ${per(slow - even)} slow late, against even pace.`;
  }
  if (id === 'ambition') {
    // Whole percent, as the chart's readout shows it.
    const p = rows('value').map(r => ({ x: Number(r.label), share: r.value })).filter(r => Number.isFinite(r.x));
    if (!p.length) return '';
    const at = p.reduce((b, r) => (Math.abs(r.x - goal) < Math.abs(b.x - goal) ? r : b));
    return `${Math.round(at.share)}% of these finishes were under ${clock(goal * 60)}.`;
  }
  if (id === 'terrain') {
    const pace = answer.charts.find(c => c.unit === 'min/km');
    const climbs = answer.charts.find(c => c.series.some(s => s.key === 'gain'));
    if (!pace || !climbs) return '';
    const gain = MARATHON_SECTION_ENDS.map(end => Number(climbs.rows.find(r => r.label === sectionLabel(end))?.gain));
    const p = pace.rows.map(r => Number(r.value));
    if (gain.some(v => !Number.isFinite(v)) || p.some(v => !Number.isFinite(v))) return '';
    const climb = gain.reduce((b, v, i) => v > gain[b] ? i : b, 0), slow = p.reduce((b, v, i) => v > p[b] ? i : b, 0);
    const name = cityName(city);
    return climb === slow
      ? `${name}’s biggest climb, ${sectionLabel(MARATHON_SECTION_ENDS[climb])} (+${wholeElevation(gain[climb], units)}), is also its slowest 5K near ${clock(goal * 60)}.`
      : `${name} climbs most in ${sectionLabel(MARATHON_SECTION_ENDS[climb])} (+${wholeElevation(gain[climb], units)}); near ${clock(goal * 60)} its slowest 5K is ${sectionLabel(MARATHON_SECTION_ENDS[slow])}.`;
  }
  return '';
}

/**
 * The explorer of a guide analysis (Make it yours, the redesign spec, sections 3.5 and 4.2): course, finish time and
 * the refinements in one form (a sheet under 900 px, inline from 900 px; every S2-pinned label kept), then the
 * selection's headline and one chart. The page's default is drawn at build (`initialAnswer` for `start`, the all-course
 * 4:00 example unless the page says otherwise); any other selection loads its course's published aggregate.
 * `historyMode` is the earlier-result view of courses and start temperatures, which keeps the archive's range charts.
 */
export default function AnalysisExplorer({ definition, summary, initialAnswer, start = EXAMPLE_PROFILE, terrain, historyMode = false, untouched = 'chart' }: {
  definition: AnalysisDefinition; summary: PersonalSummary; initialAnswer: GuideAnswer; start?: Profile;
  /** Hills: each course's supplied elevation profile and the shared height scale. */
  terrain?: { elevations: Record<string, number[]>; step: number; relief: number }; historyMode?: boolean; weatherQuestions?: unknown[];
  /**
   * What the explorer shows before the visitor changes anything. The page's answer already states the example, so the
   * explorer never repeats its headline: 'chart' draws the example's chart alone (the page's only picture of it),
   * 'none' only the selection row, when the answer above already draws that chart. Any change shows the headline too.
   */
  untouched?: 'chart' | 'none';
}) {
  const { units } = useUnits();
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const text = (value: string | undefined) => unitText(value || '', units);
  const [profile, setProfile] = useState<Profile>(start);
  const [draft, setDraft] = useState<Profile>(start);
  const [timeText, setTimeText] = useState(clock(start.goal * 60));
  const [previousText, setPreviousText] = useState('');
  const [data, setData] = useState<CityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [retry, setRetry] = useState(0);
  const [changed, setChanged] = useState(false);
  const [refining, setRefining] = useState(false);
  const courseOnly = definition.id === 'terrain';
  const city = summary.cities.find(row => row.city === profile.city) ?? summary.cities.find(row => row.city === start.city)!;
  const usesCityData = definition.id !== 'courses' && definition.id !== 'checkpoint';
  const setSelection = (next: Profile) => {
    setProfile(next); setDraft(next); setTimeText(clock(next.goal * 60)); setPreviousText(next.previous === null ? '' : clock(next.previous * 60));
    setRefining(next.age !== 'all' || next.gender !== 'all' || next.previous !== null);
  };
  useEffect(() => {
    // units=km alone is not a comparison: a kilometres visitor arriving from a link still starts with the example.
    const restore = () => {
      const query = new URLSearchParams(window.location.search); query.delete('units');
      const read = readAnalysisProfile(window.location.search, summary);
      // A course-only analysis never shows "All courses": without a course in the address it opens on its own.
      setSelection(courseOnly && (read.city === EXAMPLE_PROFILE.city || !query.has('race')) ? { ...read, city: start.city } : read);
      setChanged(query.toString() !== ''); setFormError('');
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [summary, courseOnly, start.city]);
  useEffect(() => {
    if (!usesCityData || sameProfile(profile, start)) { setLoading(false); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    loadAnalysisAggregate<CityData>(city.file, city.city, summary.as_of, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setData(value); setLoading(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [city.file, city.city, summary.as_of, profile, retry, usesCityData, start]);
  const answer = useMemo(() => {
    if (definition.id === 'courses') return buildGuide({ city: 'All courses', cohorts: {}, terrain: [] }, summary, profile).find(item => item.id === definition.id)!;
    if (sameProfile(profile, start)) return initialAnswer;
    if (data?.city !== profile.city) return null;
    return buildGuide(data, summary, profile).find(item => item.id === definition.id)!;
  }, [data, profile, summary, definition.id, initialAnswer, start]);
  const hasResults = !!answer?.charts.length;
  const applyProfile = (nextProfile: Profile) => {
    trackAnalytics('analysis_filters_applied', { analysis: definition.id, course_scope: nextProfile.city === 'All courses' ? 'all' : 'single' });
    setSelection(nextProfile); setChanged(true); setFormError('');
    window.history.pushState(null, '', unitHref(window.location.pathname + profileSearch(nextProfile) + (historyMode ? '&comparison=history' : ''), units));
  };
  const visibleAnswer = answer ? insightHeadline(definition.id, answer, profile.goal, units, profile.city) || findingText(answer, units) : '';
  const field = (key: string) => `${formId}-${key}`;
  const timeLabel = ['profile', 'terrain', 'gains', 'age'].includes(definition.id) ? 'Finish time to explore' : 'Target time';
  // Only the choices that matter: the course, the time, and a refinement once one is set (never "All ages").
  const summaryText = [cityName(profile.city), ...(definition.controls.time ? [clock(profile.goal * 60)] : []), ...(profile.age === 'all' ? [] : [profile.age]),
    ...(profile.gender === 'all' ? [] : [profile.gender]), ...(profile.previous === null ? [] : [`earlier ${clock(profile.previous * 60)}`])].join(' · ');
  const cityOptions = summary.cities.filter(row => !courseOnly || row.city !== EXAMPLE_PROFILE.city);
  const terrainExtras: TerrainExtras | undefined = terrain ? { elevation: terrain.elevations[profile.city] ?? null, step: terrain.step, relief: terrain.relief } : undefined;
  const refinements = (
          <div className="explore-fields">
            {definition.controls.age && <div className="field"><label className="field-label" htmlFor={field('age')}>Age group</label><select id={field('age')} className="select" value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></div>}
            <div className="field"><label className="field-label" htmlFor={field('gender')}>Recorded gender</label><select id={field('gender')} className="select" value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}><option value="all">All recorded categories</option><option value="Women">Women</option><option value="Men">Men</option></select></div>
            {definition.controls.previous && <div className="field"><label className="field-label" htmlFor={field('previous')}>Earlier marathon · optional</label><input id={field('previous')} className="input" value={previousText} onChange={event => setPreviousText(keypadInput(event.target, event.nativeEvent))} placeholder="e.g. 4:15" inputMode="decimal" spellCheck={false} autoComplete="off" /></div>}
          </div>
  );
  const shown = changed || untouched === 'chart';
  return <div className="analysis-layout explorer guide-explorer">
    <MakeItYours id={`${formId}-miy`} summary={summaryText} busy={loading}>
      <form className="explore-form" onSubmit={event => {
        event.preventDefault();
        const goal = definition.controls.time ? parseMinutes(timeText) : draft.goal;
        const earlier = definition.controls.previous ? (previousText.trim() ? parseMinutes(previousText) : null) : draft.previous;
        if (goal === null || goal < GOAL_MIN || goal > GOAL_MAX) { setFormError('Enter a time between ' + clock(GOAL_MIN * 60) + ' and ' + clock(GOAL_MAX * 60) + ', using hours:minutes.'); return; }
        if (previousText.trim() && definition.controls.previous && (earlier === null || earlier < 90 || earlier > 720)) { setFormError('Enter your earlier marathon time in hours:minutes, or leave it blank.'); return; }
        applyProfile({ ...draft, goal, previous: earlier });
      }}>
        {(definition.controls.course || definition.controls.time) && <div className="explore-fields">
          {definition.controls.course && <div className="field"><label className="field-label" htmlFor={field('course')}>Course</label><select id={field('course')} className="select" value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })}>{cityOptions.map(row => <option key={row.city} value={row.city}>{cityName(row.city)}</option>)}</select></div>}
          {definition.controls.time && <div className="field"><label className="field-label" htmlFor={field('time')}>{timeLabel}</label><input id={field('time')} className="input" value={timeText} onChange={event => setTimeText(keypadInput(event.target, event.nativeEvent))} placeholder="4:00" inputMode="decimal" spellCheck={false} autoComplete="off" aria-describedby={field('time-help')} /><p className="field-hint" id={field('time-help')}>Hours:minutes.<KeypadHint /></p></div>}
        </div>}
        {definition.controls.course || definition.controls.time
          ? <details className="profile-refinements" open={refining} onToggle={event => setRefining(event.currentTarget.open)}><summary>Refine by {definition.controls.age ? 'age, ' : ''}gender{definition.controls.previous ? ' or an earlier marathon' : ''}</summary>{refinements}</details>
          : refinements}
        {formError && <p className="field-error" role="alert">{formError}</p>}
        <button type="submit" className="btn btn-secondary is-compact explore-submit">Update comparison</button>
      </form>
    </MakeItYours>
    <div className="sr-only" role="status">{loading ? 'Loading your comparison.' : changed && answer ? 'Comparison updated. ' + (answer.comparison || '') : ''}</div>
    <div className="miy-results">
      {loading && !answer ? <p className="explore-state">Loading the comparison…</p>
        : error ? <div className="explore-state" role="alert"><p>{error}</p><button className="btn btn-secondary is-compact" onClick={() => setRetry(value => value + 1)} type="button">Try loading again</button></div>
        : answer && shown ? <div className="explore-results">
          {changed ? <h2 className="explore-title">{text(visibleAnswer)}</h2> : null}
          {answer.widened && <p className="explore-note">{text(answer.widened)}</p>}
          {!hasResults ? <div className="explore-state"><p>Try All courses, fewer refinements or another finish time.</p><button className="btn btn-secondary is-compact" type="button" onClick={() => applyProfile(start)}>Back to the example</button></div>
            : historyMode ? <AnalysisChart charts={answer.charts} analysisId={definition.id + profileSearch(profile)} />
            : <ExplorerChart id={definition.id} answer={answer} goal={profile.goal} units={units} terrain={terrainExtras} valuesId={`${formId}-values`} selectedAge={profile.age === 'all' ? undefined : profile.age} />}
        </div> : null}
    </div>
  </div>;
}
