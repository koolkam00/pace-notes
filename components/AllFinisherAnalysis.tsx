'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { elevationLabel, type UnitSystem } from '@/lib/units';
import { clock } from '@/lib/personalized';
import { MARATHON_SECTION_ENDS, sectionLabel } from '@/lib/section-labels';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';
import { ALL_FINISHER_DEFAULT, allFinisherGroupLabel, allFinisherGroups, allFinisherRow, allFinisherSearch, earlyPaceLabel, loadAllFinisherContext, readAllFinisherSelection,
  type AllFinisherEvidence, type AllFinisherGroup, type AllFinisherKind, type AllFinisherSelection, type AllFinisherStart } from '@/lib/all-finisher-context';
import MakeItYours from './ui/MakeItYours.client';
import Segmented from './ui/Segmented.client';
import Values from './ui/Values';
import DotStrip from './viz/DotStrip';
import LineProfile from './viz/LineProfile';
import Columns from './analysis/Columns';

const percent = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
const cityName = (city: string) => city === 'New York' ? 'New York City' : city;
/** A signed % pace change in words: "8.1% slower", "2.0% faster". */
const paceChange = (value: number) => Math.abs(value) < 0.05 ? 'about the same' : `${percent(Math.abs(value))} ${value < 0 ? 'faster' : 'slower'}`;
/** A time difference in seconds in words: "9.3 min more", "about the same time". */
const timeDifference = (seconds: number) => Math.abs(seconds) < 3 ? 'about the same time' : `${(Math.abs(seconds) / 60).toLocaleString('en-US', { maximumFractionDigits: 1 })} min ${seconds < 0 ? 'less' : 'more'}`;
const SECTION_MIDS = MARATHON_SECTION_ENDS.map((end, i) => ((i ? MARATHON_SECTION_ENDS[i - 1] : 0) + end) / 2);
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
const isProfileKind = (kind: AllFinisherKind) => kind === 'course-profile' || kind === 'weather-profile' || kind === 'race-day';
/** Its measure: the spread of late-race pace for consistency, the late pace change for the profile views, else the slowdown rate. */
const measureOf = (kind: AllFinisherKind) => kind === 'course-consistency' ? 'late_spread_pct' : isProfileKind(kind) && kind !== 'race-day' ? 'late_pct' : 'slowdown_pct';

/** The headline for the groups on screen: the spread of the measure each view leads with. */
function headline(groups: AllFinisherGroup[], kind: AllFinisherKind, label: (group: AllFinisherGroup) => string): string {
  const measure = measureOf(kind);
  const sorted = [...groups].sort((a, b) => a[measure] - b[measure]);
  const low = sorted[0], high = sorted[sorted.length - 1];
  const value = (group: AllFinisherGroup) => measure === 'late_pct' ? paceChange(group.late_pct)
    : measure === 'late_spread_pct' ? `${group.late_spread_pct.toLocaleString('en-US', { maximumFractionDigits: 1 })} percentage points` : percent(group.slowdown_pct);
  if (measure === 'late_spread_pct') return groups.length === 1 ? `Late-race pace changes spread over ${value(low)} (${label(low)}).`
    : `Late-race experiences varied most in ${label(high)} (${value(high)}) and least in ${label(low)} (${value(low)}).`;
  if (measure === 'late_pct') return groups.length === 1 ? `Late-race pace was ${value(low)} ${Math.abs(low.late_pct) < 0.05 ? 'as' : 'than'} early-race pace (${label(low)}).`
    : `Late-race pace ranged from ${value(low)} (${label(low)}) to ${value(high)} (${label(high)}) than early-race pace.`;
  return groups.length === 1 ? `The sustained slowdown rate was ${value(low)} (${label(low)}).`
    : groups.length === 2 ? `Sustained slowdown rates were ${value(low)} (${label(low)}) and ${value(high)} (${label(high)}).`
    : `Sustained slowdown rates ranged from ${value(low)} (${label(low)}) to ${value(high)} (${label(high)}).`;
}

/**
 * The group a view follows when the address names none: the downhill-start group; for courses and start temperatures
 * the one with the fewest sustained slowdowns (the end the page's headline names first); for consistency the most
 * varied; for the profile views the first.
 */
export function defaultFocus(groups: AllFinisherGroup[], kind: AllFinisherKind): AllFinisherGroup | undefined {
  if (kind === 'downhill') return groups.find(g => g.terrain === 'downhill') ?? groups[0];
  if (isProfileKind(kind)) return groups[0];
  const measure = measureOf(kind);
  const lowest = kind !== 'course-consistency';
  return groups.reduce<AllFinisherGroup | undefined>((a, b) => (!a || (lowest ? b[measure] < a[measure] : b[measure] > a[measure]) ? b : a), undefined);
}

/** A start-temperature band as a short column label: "41–50°F", "<41°F", "68°F+". */
function bandShort(g: AllFinisherGroup, units: UnitSystem) {
  const t = (c: number) => Math.round(units === 'mi' ? c * 1.8 + 32 : c);
  const deg = units === 'mi' ? '°F' : '°C';
  if (g.lower_c == null) return `<${t(g.upper_c!)}${deg}`;
  if (g.upper_c == null) return `${t(g.lower_c)}${deg}+`;
  return `${t(g.lower_c)}–${t(g.upper_c)}${deg}`;
}

/**
 * One selection's results (the redesign spec, sections 7.4, 7.10 and 7.11): the headline (pinned by
 * verify-all-finisher-context-client), one sentence about the group followed, one chart, and every group's values.
 * Courses: a ranked dot strip. Start temperatures: columns. Downhill starts and the profile views: the pace through the
 * race, the group followed against its comparison.
 */
export function AllFinisherResults({ groups, kind, units, focus, comparison }: { groups: AllFinisherGroup[]; kind: AllFinisherKind; start: AllFinisherStart; units: UnitSystem; focus: AllFinisherGroup; comparison?: AllFinisherGroup }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const raceDay = kind === 'race-day';
  // A race day shows the edition followed and its comparison only, so its headline speaks of those two.
  const pair = [focus, ...(comparison && comparison.id !== focus.id ? [comparison] : [])];
  const shown = raceDay ? pair : groups;
  const label = (group: AllFinisherGroup) => allFinisherGroupLabel(group, kind, units);
  const onsetAt = focus.onset_pct ? focus.onset_pct.reduce((best, value, i) => value > focus.onset_pct![best] ? i : best, 0) : -1;
  const measure = measureOf(kind);
  const display = (g: AllFinisherGroup) => measure === 'late_spread_pct' ? `${g.late_spread_pct.toLocaleString('en-US', { maximumFractionDigits: 1 })} pts` : measure === 'late_pct' ? signedPct(g.late_pct) : percent(g.slowdown_pct);
  let chart: ReactNode;
  if (kind === 'courses' || kind === 'course-consistency') {
    const v = groups.map(g => g[measure]);
    const lo = Math.floor(Math.min(...v) / 10) * 10, hi = Math.ceil(Math.max(...v) / 10) * 10;
    const ticks = Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10);
    // Room past the last dot for its name, which centres on the dot.
    const end = Math.max(...v) > hi - 5 ? hi + 5 : hi;
    chart = <DotStrip items={groups.map(g => ({ id: g.id, label: label(g), value: g[measure], display: display(g), detail: g.n.toLocaleString('en-US'), hollow: g.edition_n < 3, subject: g.id === focus.id }))}
      domain={[lo, end]} ticks={ticks.map(t => ({ value: t, label: measure === 'late_spread_pct' ? `${t} pts` : `${t}%` }))} readoutKey="Finishes"
      keyLabels={{ filled: 'Three or more editions', hollow: 'Fewer editions' }}
      label={`${headline(groups, kind, label)} One dot per course; tap a dot to read it.`} />;
  } else if (kind === 'weather') {
    chart = <Columns items={groups.map(g => ({ id: g.id, label: bandShort(g, units), value: g.slowdown_pct, display: percent(g.slowdown_pct), tone: g.edition_n < 5 ? 'hollow' : g.id === focus.id ? 'signal' : 'ink' }))}
      max={Math.ceil(Math.max(...groups.map(g => g.slowdown_pct)) / 10) * 10 + 5} label={headline(groups, kind, label)}
      keys={groups.some(g => g.edition_n < 5) ? [{ label: 'Fewer than five races', mark: 'hollow' }] : undefined} />;
  } else {
    const all = pair.flatMap(g => g.profile_pct).concat(0);
    const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5;
    const slowest = focus.profile_pct.reduce((b, v, i) => v > focus.profile_pct[b] ? i : b, 0);
    chart = <LineProfile x={SECTION_MIDS} xDomain={[0, 42.195]} yDomain={[Math.min(lo, -2.5), hi]}
      layers={[{ id: 'p', label: label(focus), series: [...(comparison && comparison.id !== focus.id ? [{ id: 'c', values: comparison.profile_pct, tone: 'quiet' as const }] : []), { id: 'f', values: focus.profile_pct }],
        labels: [{ x: SECTION_MIDS[slowest], y: focus.profile_pct[slowest], text: `${sectionLabel(MARATHON_SECTION_ENDS[slowest])} ${signedPct(focus.profile_pct[slowest])}`, priority: 3 }] }]}
      refs={[{ value: 0, label: 'early-race pace' }]}
      xTicks={[{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }]}
      keys={[{ label: label(focus), mark: 'line' }, ...(comparison && comparison.id !== focus.id ? [{ label: label(comparison), mark: 'line' as const, tone: 'quiet' as const }] : [])]}
      label={`Section pace against early-race pace: ${label(focus)}${comparison && comparison.id !== focus.id ? ` against ${label(comparison)}` : ''}`} height={190} heightMd={230} />;
  }
  return (
    <div className="explore-results">
      <h2 className="explore-title">{headline(shown, kind, label)}</h2>
      <p className="explore-sentence">
        {label(focus)}: the typical finish took <strong>{timeDifference(focus.after20_delta_s)}</strong> after 20K than the same distance at early-race pace.{' '}
        {focus.onset_pct ? <>Its <Link href="/methodology#sustained-slowdown">sustained slowdowns</Link> most often began in the {sectionLabel(25 + onsetAt * 5)} section ({percent(focus.onset_pct![onsetAt])} of them).</> : 'Too few detected slowdowns to show where they began.'}
      </p>
      {raceDay && <p className="explore-note">{focus.temp_c == null ? 'Start-hour temperature is unavailable.' : `Start-hour temperature: ${Number((units === 'mi' ? focus.temp_c * 1.8 + 32 : focus.temp_c).toFixed(1))}°${units === 'mi' ? 'F' : 'C'}.`} {focus.opening_net_m == null ? '' : `Net elevation change over the first 5K: ${elevationLabel(focus.opening_net_m, units)}.`}</p>}
      {chart}
      <Values id={`${id}-values`} caption={headline(shown, kind, label)}
        columns={[{ key: 'g', label: raceDay ? 'Race edition' : kind === 'weather' || kind === 'weather-profile' ? 'At the start' : kind === 'downhill' ? 'Opening' : 'Course', text: true },
          { key: 's', label: raceDay ? 'Slowdown rate in this edition' : 'Sustained slowdown' }, { key: 'l', label: 'Late-race pace' }, { key: 't', label: 'After 20K' }, { key: 'm', label: 'Median finish' }, { key: 'n', label: 'Finishes' }]}
        rows={[...shown].sort((a, b) => a[measure] - b[measure]).map(g => [label(g), percent(g.slowdown_pct), paceChange(g.late_pct), timeDifference(g.after20_delta_s), clock(g.actual_finish_median_s, true), g.n.toLocaleString('en-US')])}
        reading={[...shown].sort((a, b) => a[measure] - b[measure]).indexOf(focus)} />
    </div>
  );
}

/**
 * The all-finisher explorer (Make it yours) for courses, start temperatures and downhill starts, and the archive's
 * profile views: the comparison (every eligible finish, or with an earlier result through `history`), course, early-race
 * pace, age group, recorded gender, and the group to follow, in one form (a sheet under 900 px, inline from 900 px).
 * The all-course example is in the page; anything else loads the published evidence, checked against its hash.
 */
export default function AllFinisherAnalysis({ kind, start, history, title, description, archive = false }: { kind: AllFinisherKind; start: AllFinisherStart; history?: ReactNode; title?: string; description?: string; archive?: boolean; related?: ReactNode }) {
  const { units } = useUnits();
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [selection, setSelection] = useState<AllFinisherSelection>(ALL_FINISHER_DEFAULT);
  const [draft, setDraft] = useState<AllFinisherSelection>(ALL_FINISHER_DEFAULT);
  const [data, setData] = useState<AllFinisherEvidence | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [focusId, setFocusId] = useState(''), [comparisonId, setComparisonId] = useState('');
  const [focusDraft, setFocusDraft] = useState(''), [comparisonDraft, setComparisonDraft] = useState('');
  const all = selection.mode === 'all' || !history;
  const initial = allFinisherRow([start.initial], selection);
  useEffect(() => {
    const restore = () => { const p = new URLSearchParams(window.location.search); const next = readAllFinisherSelection(window.location.search, start); setSelection(next); setDraft(next); setFocusId(p.get('focus') || ''); setComparisonId(p.get('compare') || ''); setFocusDraft(p.get('focus') || ''); setComparisonDraft(p.get('compare') || ''); };
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
  const focus = groups.find(group => group.id === focusId) || defaultFocus(groups, kind);
  const comparison = kind === 'downhill' ? groups.find(g => g.id !== focus?.id) : comparisonId === 'none' ? undefined : groups.find(group => group.id === comparisonId && group.id !== focus?.id) || groups.find(group => group.id !== focus?.id);
  const apply = (next: AllFinisherSelection, nextFocus = focusDraft, nextCompare = comparisonDraft) => {
    if (kind === 'courses' || kind === 'weather') trackAnalytics('analysis_filters_applied', { analysis: kind, course_scope: next.city === 'All courses' ? 'all' : 'single' });
    setSelection(next); setDraft(next); setFocusId(nextFocus); setComparisonId(nextCompare);
    const params = new URLSearchParams(allFinisherSearch(next));
    if (nextFocus) params.set('focus', nextFocus);
    if (nextCompare) params.set('compare', nextCompare);
    window.history.pushState(null, '', unitHref(window.location.pathname + '?' + params.toString(), units));
  };
  const mode = (value: 'all' | 'history') => {
    const params = new URLSearchParams(window.location.search); params.set('comparison', value);
    if (value === 'all') { params.delete('previous'); params.delete('prior'); }
    window.history.pushState(null, '', unitHref(window.location.pathname + '?' + params.toString(), units)); window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const pending = all && !initial && !data && !error;
  const label = (group: AllFinisherGroup) => allFinisherGroupLabel(group, kind, units);
  const field = (key: string) => `${formId}-${key}`;
  const follows = kind !== 'downhill' && groups.length > 1;
  const followLabel = kind === 'race-day' ? 'Race edition to follow' : kind === 'weather' || kind === 'weather-profile' ? 'Start temperature to follow' : kind === 'courses' || kind === 'course-consistency' || kind === 'course-profile' ? 'Course to follow' : 'Group to follow';
  const summary = [selection.city === 'All courses' ? 'All courses' : cityName(selection.city), earlyPaceLabel(start.early_pace_bands.find(b => b.id === selection.early_pace)!, units), selection.age === 'all' ? 'All ages' : selection.age,
    ...(selection.gender === 'all' ? [] : [selection.gender]), ...(kind === 'downhill' ? [start.opening_bands.find(b => b.id === selection.opening)?.label ?? ''] : []), ...(all ? [] : ['With an earlier result'])].filter(Boolean).join(' · ');
  const modes = history && <div className="explore-mode"><Segmented label="Choose the comparison" block value={all ? 'all' : 'history'} onChange={value => mode(value as 'all' | 'history')}
    options={[{ value: 'all', label: 'All eligible finishes' }, { value: 'history', label: 'With an earlier result' }]} /><p className="field-hint">{all ? 'No previous race needed' : 'Compared with recorded race history'}</p></div>;
  return <div className="analysis-layout explorer af-explorer">
    {archive ? <header className="explorer-head"><h1 className="t-title">{title}</h1>{description ? <p className="t-body">{description}</p> : null}</header> : null}
    {!all ? <>{modes}{history}</> : <>
      <MakeItYours id={`${formId}-miy`} summary={summary} busy={pending || loading}>
        <form className="explore-form" onSubmit={event => { event.preventDefault(); apply(draft); }}>
          {modes}
          <div className="explore-fields">
            {kind !== 'courses' && kind !== 'course-consistency' && kind !== 'course-profile' && <div className="field"><label className="field-label" htmlFor={field('course')}>Course</label><select id={field('course')} className="select" value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })}>{start.cities.map(city => <option key={city} value={city}>{cityName(city)}</option>)}</select></div>}
            <div className="field"><label className="field-label" htmlFor={field('early')}>Early-race pace</label><select id={field('early')} className="select" value={draft.early_pace} onChange={event => setDraft({ ...draft, early_pace: event.target.value })}>{start.early_pace_bands.map(band => <option key={band.id} value={band.id}>{earlyPaceLabel(band, units)}</option>)}</select></div>
            {kind === 'downhill' && <div className="field"><label className="field-label" htmlFor={field('opening')}>Opening pace</label><select id={field('opening')} className="select" value={draft.opening} onChange={event => setDraft({ ...draft, opening: event.target.value })}>{start.opening_bands.map(band => <option key={band.id} value={band.id}>{band.label}</option>)}</select></div>}
            <div className="field"><label className="field-label" htmlFor={field('age')}>Age group</label><select id={field('age')} className="select" value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{start.ages.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></div>
            <div className="field"><label className="field-label" htmlFor={field('gender')}>Recorded gender</label><select id={field('gender')} className="select" value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}>{start.genders.map(gender => <option key={gender} value={gender}>{gender === 'all' ? 'All recorded categories' : gender}</option>)}</select></div>
            {follows && focus && <div className="field"><label className="field-label" htmlFor={field('focus')}>{followLabel}</label><select id={field('focus')} className="select" value={focusDraft || focus.id} onChange={event => setFocusDraft(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{label(group)}</option>)}</select></div>}
            {isProfileKind(kind) && focus && <div className="field"><label className="field-label" htmlFor={field('compare')}>Compare pacing with</label><select id={field('compare')} className="select" value={comparisonDraft || comparison?.id || 'none'} onChange={event => setComparisonDraft(event.target.value)}><option value="none">No comparison line</option>{groups.filter(group => group.id !== (focusDraft || focus.id)).map(group => <option key={group.id} value={group.id}>{label(group)}</option>)}</select></div>}
          </div>
          <button type="submit" className="btn btn-secondary is-compact explore-submit">Update comparison</button>
        </form>
      </MakeItYours>
      <div className="sr-only" role="status">{pending || loading ? 'Loading your comparison.' : error ? '' : focus ? `Comparison updated. ${groups.length} groups are available.` : 'Not enough results for this exact selection.'}</div>
      <div className="miy-results">
        {(pending || loading) && !row ? <p className="explore-state">Loading the comparison…</p>
          : error ? <div className="explore-state" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary is-compact" onClick={() => setRetry(value => value + 1)}>Try again</button></div>
          : focus ? <AllFinisherResults groups={groups} kind={kind} start={start} units={units} focus={focus} comparison={comparison} />
          : <div className="explore-state"><h2 className="explore-title">Not enough results for this exact comparison.</h2><p>Try a broader course, early pace, age or gender{kind === 'downhill' ? ', or another opening' : ''}.</p><button className="btn btn-secondary is-compact" type="button" onClick={() => apply(ALL_FINISHER_DEFAULT, '', '')}>Reset the comparison</button></div>}
      </div>
    </>}
  </div>;
}
