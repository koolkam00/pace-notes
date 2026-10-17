'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import QuestionViz from './QuestionViz';
import { distanceLabel, elevationLabel, unitText, type UnitSystem } from '@/lib/units';
import { clock } from '@/lib/personalized';
import { TEN_ANALYSES, analysisHref } from '@/lib/ten-analyses';
import { chartOnly } from './AnalysisChart';
import { trackAnalytics } from '@/lib/analytics';
import { dropDefaults, unitHref } from '@/lib/unit-preference';
import { ALL_FINISHER_DEFAULT, allFinisherCharts, allFinisherFamily, allFinisherGroupLabel, allFinisherGroups, allFinisherRow, allFinisherSearch, earlyPaceLabel, loadAllFinisherContext, readAllFinisherSelection,
  type AllFinisherEvidence, type AllFinisherGroup, type AllFinisherKind, type AllFinisherSelection, type AllFinisherStart } from '@/lib/all-finisher-context';

const percent = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
const cityName = (city: string) => city === 'New York' ? 'New York City' : city;
const COPY: Record<AllFinisherKind, { title: string; description: string }> = {
  courses: { title: 'How does pacing compare across courses?', description: 'See how often runners slowed late, how much their pace changed and how varied their races were, course by course.' },
  weather: { title: 'How do warm and cool races compare?', description: 'See how late slowing and pace changes differed between cooler and warmer race days.' },
  downhill: { title: 'What follows a downhill opening?', description: 'See what happened later in races that began with a larger descent, next to races with other openings.' },
  'weather-profile': { title: 'How does pacing change across race-day temperatures?', description: 'See the shape of a race in cooler and warmer conditions, from the start to the finish.' },
  'course-consistency': { title: 'How much do pacing experiences vary on each course?', description: 'Some race fields finish with a similar rhythm; others spread out.' },
  'course-profile': { title: 'How do pacing patterns differ between courses?', description: 'See the course pacing patterns side by side, from the start to the finish.' },
  'race-day': { title: 'How did runners pace a particular race day?', description: 'Choose a race edition to see its pacing, its conditions and how many runners slowed late.' },
};
/** A signed % pace change in words: "8.1% slower", "2.0% faster". */
const paceChange = (value: number) => Math.abs(value) < 0.05 ? 'about the same' : `${percent(Math.abs(value))} ${value < 0 ? 'faster' : 'slower'}`;
/** A time difference in seconds in words: "9.3 min more", "about the same time". */
const timeDifference = (seconds: number) => Math.abs(seconds) < 3 ? 'about the same time' : `${(Math.abs(seconds) / 60).toLocaleString('en-US', { maximumFractionDigits: 1 })} min ${seconds < 0 ? 'less' : 'more'}`;

/** The headline for the groups on screen: the spread of the measure each view leads with. */
function headline(groups: AllFinisherGroup[], kind: AllFinisherKind, label: (group: AllFinisherGroup) => string): string {
  const measure = kind === 'course-consistency' ? 'late_spread_pct' : kind === 'course-profile' || kind === 'weather-profile' ? 'late_pct' : 'slowdown_pct';
  const sorted = [...groups].sort((a, b) => a[measure] - b[measure]);
  const low = sorted[0], high = sorted[sorted.length - 1];
  const value = (group: AllFinisherGroup) => measure === 'late_pct' ? paceChange(group.late_pct)
    : measure === 'late_spread_pct' ? `${group.late_spread_pct.toLocaleString('en-US', { maximumFractionDigits: 1 })} percentage points` : percent(group.slowdown_pct);
  if (measure === 'late_spread_pct') return groups.length === 1 ? `Late-race pace changes spread over ${value(low)} (${label(low)}).`
    : `Late-race experiences varied most in ${label(high)} (${value(high)}) and least in ${label(low)} (${value(low)}).`;
  if (measure === 'late_pct') return groups.length === 1 ? `Late-race pace was ${value(low)} ${Math.abs(low.late_pct) < 0.05 ? 'as' : 'than'} early-race pace (${label(low)}).`
    : `Late-race pace ranged from ${value(low)} (${label(low)}) to ${value(high)} (${label(high)}) than early-race pace.`;
  return groups.length === 1 ? `The sustained slowdown rate was ${value(low)} (${label(low)}).`
    : `Sustained slowdown rates ranged from ${value(low)} (${label(low)}) to ${value(high)} (${label(high)}).`;
}

export function AllFinisherResults({ groups, kind, units, focus, comparison }: { groups: AllFinisherGroup[]; kind: AllFinisherKind; start: AllFinisherStart; units: UnitSystem; focus: AllFinisherGroup; comparison?: AllFinisherGroup }) {
  const raceDay = kind === 'race-day';
  // A race day shows the edition followed and its comparison only, so its headline speaks of those two.
  const shown = raceDay ? [focus, ...(comparison && comparison.id !== focus.id ? [comparison] : [])] : groups;
  const charts = allFinisherCharts(shown, focus, comparison, kind, units);
  const label = (group: AllFinisherGroup) => allFinisherGroupLabel(group, kind, units);
  const profileFirst = kind === 'course-profile' || kind === 'weather-profile' || raceDay;
  const primary = profileFirst ? charts.profile : kind === 'course-consistency' ? charts.consistency : charts.slowdown;
  const onsetAt = focus.onset_pct ? focus.onset_pct.reduce((best, value, i) => value > focus.onset_pct![best] ? i : best, 0) : -1;
  return <>
    <section className="analysis-finding af-finding"><p className="eyebrow">What these race fields show</p><h2>{headline(shown, kind, label)}</h2></section>
    <QuestionViz spec={chartOnly(primary)} unitSystem={units} />
    <section className="af-section"><p className="eyebrow">Follow the selected group</p><h2>{label(focus)}</h2><div className="af-numbers"><div><strong>{percent(focus.slowdown_pct)}</strong><span>{raceDay ? 'Slowdown rate in this edition' : 'Mean edition slowdown rate'}</span></div><div><strong>{paceChange(focus.late_pct)}</strong><span>Typical late-race pace, against early-race pace</span></div><div><strong>{clock(focus.actual_finish_median_s, true)}</strong><span>Median recorded finish</span></div></div>{raceDay && <p className="control-help">{focus.temp_c == null ? 'Start-hour temperature is unavailable.' : `Start-hour temperature: ${Number((units === 'mi' ? focus.temp_c * 1.8 + 32 : focus.temp_c).toFixed(1))}°${units === 'mi' ? 'F' : 'C'}.`} {focus.opening_net_m == null ? '' : `Net elevation change over the first ${distanceLabel(5, units)}: ${elevationLabel(focus.opening_net_m, units)}.`}</p>}{!profileFirst && <QuestionViz spec={chartOnly(charts.profile)} unitSystem={units} />}{profileFirst && <QuestionViz spec={chartOnly(charts.late)} unitSystem={units} />}</section>
    <section className="af-section"><p className="eyebrow">Find the turning point</p><h2>Where did sustained slowing begin?</h2>{charts.onset && focus.onset_pct ? <><p>{label(focus)}: <Link href="/methodology#sustained-slowdown">sustained slowdowns</Link> most often began in the {unitText(`${20 + onsetAt * 5}–${25 + onsetAt * 5} km`, units)} section ({percent(focus.onset_pct[onsetAt])} of them).</p><QuestionViz spec={chartOnly(charts.onset)} unitSystem={units} /></> : <div className="empty-comparison"><h3>Too few detected slowdowns to show the onset pattern.</h3><p>Try a broader course, early pace, age or gender selection.</p></div>}</section>
    {!profileFirst && <section className="af-section"><p className="eyebrow">Look beyond the slowdown</p><h2>How much time accumulated later?</h2><p>{label(focus)}: the typical finish took {timeDifference(focus.after20_delta_s)} after {distanceLabel(20, units)} than the same distance at early-race pace.</p><QuestionViz spec={chartOnly(charts.time)} unitSystem={units} /></section>}
  </>;
}

export default function AllFinisherAnalysis({ kind, start, history, title, description, archive = false, related }: { kind: AllFinisherKind; start: AllFinisherStart; history?: ReactNode; title?: string; description?: string; archive?: boolean; related?: ReactNode }) {
  const { units } = useUnits();
  const [selection, setSelection] = useState<AllFinisherSelection>(ALL_FINISHER_DEFAULT);
  const [draft, setDraft] = useState<AllFinisherSelection>(ALL_FINISHER_DEFAULT);
  const [data, setData] = useState<AllFinisherEvidence | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [focusId, setFocusId] = useState(''), [comparisonId, setComparisonId] = useState('');
  const all = selection.mode === 'all' || !history;
  const initial = allFinisherRow([start.initial], selection);
  useEffect(() => {
    const restore = () => { const next = readAllFinisherSelection(window.location.search, start); setSelection(next); setDraft(next); setFocusId(new URLSearchParams(window.location.search).get('focus') || ''); setComparisonId(new URLSearchParams(window.location.search).get('compare') || ''); };
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, [start]);
  useEffect(() => {
    if (!all || initial || data) { setLoading(false); setError(''); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    loadAllFinisherContext(start, controller.signal).then(value => { if (!controller.signal.aborted) { setData(value); setLoading(false); } }).catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'The comparison could not load.'); setLoading(false); } });
    return () => controller.abort();
  }, [all, initial, data, start, retry]);
  const row = initial || (data ? allFinisherRow(data.rows, selection) : undefined);
  const groups = useMemo(() => row ? allFinisherGroups(row, kind, selection.opening) : [], [row, kind, selection.opening]);
  const focus = groups.find(group => group.id === focusId) || groups[0];
  const comparison = comparisonId === 'none' ? undefined : groups.find(group => group.id === comparisonId && group.id !== focus?.id) || groups.find(group => group.id !== focus?.id);
  const apply = (next: AllFinisherSelection) => { if (kind === 'courses' || kind === 'weather') trackAnalytics('analysis_filters_applied', { analysis: kind, course_scope: next.city === 'All courses' ? 'all' : 'single' }); setSelection(next); setDraft(next); setFocusId(''); setComparisonId(''); window.history.pushState(null, '', unitHref(window.location.pathname + allFinisherSearch(next), units)); };
  const mode = (value: 'all' | 'history') => {
    const params = new URLSearchParams(window.location.search); params.set('comparison', value);
    if (value === 'all') { params.delete('previous'); params.delete('prior'); }
    window.history.pushState(null, '', unitHref(window.location.pathname + '?' + params.toString(), units)); window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const chooseLine = (id: string, comparisonLine = false) => {
    if (comparisonLine) setComparisonId(id); else setFocusId(id);
    const params = new URLSearchParams(window.location.search); params.set(comparisonLine ? 'compare' : 'focus', id);
    window.history.pushState(null, '', unitHref(window.location.pathname + '?' + params.toString(), units));
  };
  const family = allFinisherFamily(kind), primaryId = family === 'courses' ? 'courses' : family === 'weather' ? 'weather' : undefined;
  const main = TEN_ANALYSES.find(item => item.id === primaryId);
  // Filters at their defaults stay out of the links; UnitLink adds units=km for a kilometres visitor.
  const navSearch = dropDefaults({ race: selection.city, age: selection.age, gender: selection.gender });
  const pending = all && !initial && !data && !error;
  const modes = history && <div className="af-modes" role="group" aria-label="Choose the comparison"><button type="button" aria-pressed={all} onClick={() => mode('all')}>All eligible finishes<span>No previous race needed</span></button><button type="button" aria-pressed={!all} onClick={() => mode('history')}>With an earlier result<span>Compare with recorded race history</span></button></div>;
  return <>
    {!all ? <><div className="af-history-switch">{modes}</div>{history}</> : <div className="analysis-layout"><aside className="analysis-sidebar"><Link href="/analyses" className="sidebar-heading">The essential ten</Link><nav aria-label="The ten ranked analyses"><ol>{TEN_ANALYSES.map(item => <li key={item.id}><Link href={analysisHref(item) + navSearch} aria-current={!archive && item.id === primaryId ? 'page' : undefined}><span>{String(item.rank).padStart(2, '0')}</span>{unitText(item.shortTitle, units)}</Link></li>)}</ol></nav><p>One question at a time.</p></aside><article className="analysis-main af-page">
      <header className="analysis-heading"><Link href={archive ? '/packs' : '/analyses'} className="eyebrow">{archive ? 'Explore the research' : main ? `Analysis ${String(main.rank).padStart(2, '0')} of 10 / Know your course` : 'Explore your opening pace'}</Link><h1>{unitText(title || COPY[kind].title, units)}</h1><p>{unitText(description || COPY[kind].description, units)}</p></header>
      {modes}
      <form className="comparison-controls" onSubmit={event => { event.preventDefault(); apply(draft); }}><div className="controls-heading"><h2>Choose the comparison</h2></div><div className="profile-fields af-controls">
        <label>Course<select value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })}>{start.cities.map(city => <option key={city} value={city}>{cityName(city)}</option>)}</select></label>
        <label>Early-race pace<select value={draft.early_pace} onChange={event => setDraft({ ...draft, early_pace: event.target.value })}>{start.early_pace_bands.map(band => <option key={band.id} value={band.id}>{earlyPaceLabel(band, units)}</option>)}</select></label>
        <label>Age group<select value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{start.ages.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></label>
        <label>Recorded gender<select value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}>{start.genders.map(gender => <option key={gender} value={gender}>{gender === 'all' ? 'All recorded categories' : gender}</option>)}</select></label>
        {kind === 'downhill' && <label>Opening pace<select value={draft.opening} onChange={event => setDraft({ ...draft, opening: event.target.value })}>{start.opening_bands.map(band => <option key={band.id} value={band.id}>{band.label}</option>)}</select></label>}
        <button type="submit" className="button-primary">Update comparison <span aria-hidden="true">↗</span></button></div></form>
      <div className="sr-only" role="status">{pending || loading ? 'Loading your comparison.' : error ? '' : focus ? `Comparison updated. ${groups.length} groups are available.` : 'Not enough results for this exact selection.'}</div>
      {pending || loading ? <p className="loading-message">Loading the comparison…</p> : error ? <div className="feedback-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : focus ? <><div className="af-line-controls"><label>{kind === 'race-day' ? 'Race edition to follow' : 'Group to follow'}<select value={focus.id} onChange={event => chooseLine(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{allFinisherGroupLabel(group, kind, units)}</option>)}</select></label><label>Compare pacing with<select value={comparison?.id || 'none'} onChange={event => chooseLine(event.target.value, true)}><option value="none">No comparison line</option>{groups.filter(group => group.id !== focus.id).map(group => <option key={group.id} value={group.id}>{allFinisherGroupLabel(group, kind, units)}</option>)}</select></label></div><AllFinisherResults groups={groups} kind={kind} start={start} units={units} focus={focus} comparison={comparison} /></> : <section className="empty-comparison"><h2>Not enough results for this exact comparison.</h2><p>Broaden the course, early pace, age or gender selection{kind === 'downhill' ? ', or try another opening group' : ''}.</p><button className="button-secondary" type="button" onClick={() => apply(ALL_FINISHER_DEFAULT)}>Reset comparison filters</button></section>}
      {related}
      <nav className="analysis-next" aria-label="Continue exploring"><Link href="/analyses">← The essential ten</Link><Link href="/runners">Explore your recorded races →</Link></nav>
    </article></div>}
  </>;
}
