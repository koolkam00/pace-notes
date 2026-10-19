'use client';

import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { elevationLabel, type UnitSystem } from '@/lib/units';
import { clock } from '@/lib/personalized';
import { MARATHON_SECTION_ENDS, sectionLabel } from '@/lib/section-labels';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';
import { ms } from '@/lib/nuggets/format';
import { ALL_FINISHER_DEFAULT, allFinisherGroupLabel, bandShort, bandWords, allFinisherGroups, allFinisherRow, allFinisherSearch, earlyPaceLabel, loadAllFinisherContext, readAllFinisherSelection,
  type AllFinisherEvidence, type AllFinisherGroup, type AllFinisherKind, type AllFinisherSelection, type AllFinisherStart } from '@/lib/all-finisher-context';
import MakeItYours from './ui/MakeItYours.client';
import { keepTogether } from './ui/keepTogether';
import { AnswerAbove, ExploreSubmit } from './analysis/ExploreSubmit';
import Segmented from './ui/Segmented.client';
import Values from './ui/Values';
import DotStrip from './viz/DotStrip';
import LineProfile from './viz/LineProfile';
import Columns from '@/components/viz/Columns';

/** Shares in whole percent everywhere in the explorer, as the page's charts and answer show them. */
const percent = (value: number) => `${Math.round(value)}%`;
const cityName = (city: string) => city === 'New York' ? 'New York City' : city;
const capital = (s: string) => s.replace(/^[a-z]/, c => c.toUpperCase());
/** A signed % pace change in words: "8.1% slower", "2.0% faster". */
const paceChange = (value: number) => Math.abs(value) < 0.05 ? 'about the same' : `${percent(Math.abs(value))} ${value < 0 ? 'faster' : 'slower'}`;
/** A time difference in seconds in words: "9:18 more", "about the same time". */
const timeDifference = (seconds: number) => Math.abs(seconds) < 3 ? 'about the same time' : `${ms(Math.abs(seconds))} ${seconds < 0 ? 'less' : 'more'}`;
const SECTION_MIDS = MARATHON_SECTION_ENDS.map((end, i) => ((i ? MARATHON_SECTION_ENDS[i - 1] : 0) + end) / 2);
const signedPct = (v: number) => { const r = Math.round(v); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`; };
/** Where a group's sustained slowdowns most often began ("30–35K, 47%"), or a dash when too few were detected to say. */
function onsetText(group: AllFinisherGroup): string {
  const shares = group.onset_pct;
  if (!shares) return '—';
  const at = shares.reduce((best, value, i) => value > shares[best] ? i : best, 0);
  return `${sectionLabel(25 + at * 5)}, ${percent(shares[at])}`;
}
/** The headline with its first "sustained slowdown" linked to the definition on /methodology, its ranges unbroken. */
function linkFirstTerm(text: string): ReactNode {
  const m = /sustained slowdowns?/i.exec(text);
  if (!m) return keepTogether(text);
  return <>{keepTogether(text.slice(0, m.index))}<Link href="/methodology#sustained-slowdown" className="term-link">{m[0]}</Link>{keepTogether(text.slice(m.index + m[0].length))}</>;
}
const isProfileKind = (kind: AllFinisherKind) => kind === 'course-profile' || kind === 'weather-profile' || kind === 'race-day';
/** Its measure: the spread of late-race pace for consistency, the late pace change for the profile views, else the slowdown rate. */
const measureOf = (kind: AllFinisherKind) => kind === 'course-consistency' ? 'late_spread_pct' : isProfileKind(kind) && kind !== 'race-day' ? 'late_pct' : 'slowdown_pct';

/**
 * The headline for the groups on screen: the spread of the measure each view leads with. `opening` (downhill starts)
 * names the opening band the rates are for, first, so a rate for one band never reads as the overall rate.
 */
function headline(groups: AllFinisherGroup[], kind: AllFinisherKind, label: (group: AllFinisherGroup) => string, opening?: string): string {
  const measure = measureOf(kind);
  // A narrow selection leaves only a few courses: the range says how many it spans.
  const few = (kind === 'courses' || kind === 'course-consistency') && groups.length < 10 ? `these ${groups.length} courses` : '';
  const sorted = [...groups].sort((a, b) => a[measure] - b[measure]);
  const low = sorted[0], high = sorted[sorted.length - 1];
  const value = (group: AllFinisherGroup) => measure === 'late_pct' ? paceChange(group.late_pct)
    : measure === 'late_spread_pct' ? `${group.late_spread_pct.toLocaleString('en-US', { maximumFractionDigits: 1 })} percentage points` : percent(group.slowdown_pct);
  if (measure === 'late_spread_pct') return groups.length === 1 ? `Late-race pace changes spread over ${value(low)} (${label(low)}).`
    : `Late-race experiences varied most in ${label(high)} (${value(high)}) and least in ${label(low)} (${value(low)})${few ? ` of ${few}` : ''}.`;
  if (measure === 'late_pct') return groups.length === 1 ? `Late-race pace was ${value(low)} ${Math.abs(low.late_pct) < 0.05 ? 'as' : 'than'} early-race pace (${label(low)}).`
    : `Late-race pace ranged from ${value(low)} (${label(low)}) to ${value(high)} (${label(high)}) than early-race pace.`;
  const rates = opening ? `After a first 5K ${opening}, sustained slowdown rates` : 'Sustained slowdown rates';
  return groups.length === 1 ? `The sustained slowdown rate was ${value(low)} (${label(low)}).`
    : groups.length === 2 ? `${rates} were ${value(low)} (${label(low)}) and ${value(high)} (${label(high)}).`
    : `Sustained slowdown rates ranged from ${value(low)} (${label(low)}) to ${value(high)} (${label(high)})${few ? ` across ${few}` : ''}.`;
}

/** Recorded gender in the site's one order: All, Women, Men (then anything else the data adds). */
const GENDERS = ['all', 'Women', 'Men'];
const genderRank = (g: string) => (GENDERS.includes(g) ? GENDERS.indexOf(g) : GENDERS.length);
const GENDER_ORDER = (genders: string[]) => [...genders].sort((a, b) => genderRank(a) - genderRank(b));

/**
 * The group a view follows when the address names none: the downhill-start group; for courses the one with the most
 * sustained slowdowns (the end the page's headline accents, where its strip opens); for start temperatures the one with
 * the fewest (the band its headline names); for consistency the most varied; for the profile views the first.
 */
export function defaultFocus(groups: AllFinisherGroup[], kind: AllFinisherKind): AllFinisherGroup | undefined {
  if (kind === 'downhill') return groups.find(g => g.terrain === 'downhill') ?? groups[0];
  if (isProfileKind(kind)) return groups[0];
  const measure = measureOf(kind);
  const lowest = kind !== 'course-consistency' && kind !== 'courses';
  return groups.reduce<AllFinisherGroup | undefined>((a, b) => (!a || (lowest ? b[measure] < a[measure] : b[measure] > a[measure]) ? b : a), undefined);
}

/**
 * One selection's results (the redesign spec, sections 7.4, 7.10 and 7.11): the headline (pinned by
 * verify-all-finisher-context-client), one sentence about the group followed, one chart, and every group's values.
 * Courses: a ranked dot strip. Start temperatures: columns. Downhill starts and the profile views: the pace through the
 * race, the group followed against its comparison.
 */
export function AllFinisherResults({ groups, kind, start, units, focus, comparison, head = true, followed = true, linkTerm = true }: {
  groups: AllFinisherGroup[]; kind: AllFinisherKind; start: AllFinisherStart; units: UnitSystem; focus: AllFinisherGroup; comparison?: AllFinisherGroup;
  /** Show the headline. Off for the untouched example when the page's answer already states the same spread. */
  head?: boolean;
  /** The visitor chose the group to follow: only then is its course dot the signal subject (the strip opens on it either way). */
  followed?: boolean;
  /** Link the headline's "sustained slowdown" to /methodology; off where the page has already linked the term. */
  linkTerm?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const raceDay = kind === 'race-day';
  // A race day shows the edition followed and its comparison only, so its headline speaks of those two.
  const pair = [focus, ...(comparison && comparison.id !== focus.id ? [comparison] : [])];
  const shown = raceDay ? pair : groups;
  const label = (group: AllFinisherGroup) => allFinisherGroupLabel(group, kind, units);
  // In a sentence the downhill groups read in lower case: "(downhill-start courses)".
  const named = (group: AllFinisherGroup) => kind === 'downhill' ? label(group).replace(/^[A-Z]/, c => c.toLowerCase()) : label(group);
  const band = kind === 'downhill' ? start.opening_bands.find(b => b.id === focus.opening) : undefined;
  const title = headline(shown, kind, named, band ? bandWords(band.label) : undefined);
  const measure = measureOf(kind);
  const display = (g: AllFinisherGroup) => measure === 'late_spread_pct' ? `${g.late_spread_pct.toLocaleString('en-US', { maximumFractionDigits: 1 })} pts` : measure === 'late_pct' ? signedPct(g.late_pct) : percent(g.slowdown_pct);
  let chart: ReactNode;
  if (kind === 'courses' || kind === 'course-consistency') {
    const v = groups.map(g => g[measure]);
    const lo = Math.floor(Math.min(...v) / 10) * 10, hi = Math.ceil(Math.max(...v) / 10) * 10;
    const ticks = Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10);
    // Room past the last dot for its name, which centres on the dot.
    const end = Math.max(...v) > hi - 5 ? hi + 5 : hi;
    chart = <DotStrip items={groups.map(g => ({ id: g.id, label: label(g), value: g[measure], display: display(g), detail: g.n.toLocaleString('en-US'), hollow: g.edition_n < 3, subject: followed && g.id === focus.id }))}
      domain={[lo, end]} ticks={ticks.map(t => ({ value: t, label: measure === 'late_spread_pct' ? `${t} pts` : `${t}%` }))} readoutKey="Finishes"
      keyLabels={{ filled: 'Three or more editions', hollow: 'Fewer editions' }}
      label={`${headline(groups, kind, named)} One dot per course; tap a dot to read it.`} />;
  } else if (kind === 'weather') {
    chart = <Columns items={groups.map(g => ({ id: g.id, label: bandShort(g, units, false), value: g.slowdown_pct, display: percent(g.slowdown_pct), tone: g.edition_n < 5 ? 'hollow' : g.id === focus.id ? 'signal' : 'ink' }))}
      max={Math.ceil(Math.max(...groups.map(g => g.slowdown_pct)) / 10) * 10 + 5} label={headline(groups, kind, named)}
      keys={groups.some(g => g.edition_n < 5) ? [{ label: 'Fewer than five races', mark: 'hollow' }] : undefined} />;
  } else {
    const all = pair.flatMap(g => g.profile_pct).concat(0);
    const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5;
    const slowest = focus.profile_pct.reduce((b, v, i) => v > focus.profile_pct[b] ? i : b, 0);
    // The slowest section is labelled under its own line, where slower is down. Where the comparison runs slower still
    // there, under the line is the comparison's side (and above it the line itself crowds the label), so the chart keeps
    // only its key and the values stay in Values: a label never reads as the other line's.
    const clear = !(comparison && comparison.id !== focus.id && comparison.profile_pct[slowest] > focus.profile_pct[slowest]);
    // Slower is down, as on every pace chart on the site, with room under the slowest section for its label.
    chart = <LineProfile x={SECTION_MIDS} xDomain={[0, 42.195]} yDomain={[hi + (hi - Math.min(lo, -2.5)) * 0.2, Math.min(lo, -2.5)]}
      layers={[{ id: 'p', label: label(focus), series: [...(comparison && comparison.id !== focus.id ? [{ id: 'c', values: comparison.profile_pct, tone: 'quiet' as const }] : []), { id: 'f', values: focus.profile_pct }],
        labels: clear ? [{ x: SECTION_MIDS[slowest], y: focus.profile_pct[slowest], text: `${sectionLabel(MARATHON_SECTION_ENDS[slowest])} ${signedPct(focus.profile_pct[slowest])}`, priority: 3, prefer: 'below' }] : [] }]}
      refs={[{ value: 0, label: 'early-race pace' }]}
      xTicks={[{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }]}
      keys={[{ label: label(focus), mark: 'line' }, ...(comparison && comparison.id !== focus.id ? [{ label: label(comparison), mark: 'line' as const, tone: 'quiet' as const }] : [])]}
      label={`Section pace against early-race pace: ${label(focus)}${comparison && comparison.id !== focus.id ? ` against ${label(comparison)}` : ''}`} height={190} heightMd={230} />;
  }
  return (
    <div className="explore-results">
      {head ? <h2 className="explore-title">{linkTerm ? linkFirstTerm(title) : keepTogether(title)}</h2> : null}
      {/* One sentence under the headline (a beat holds at most two); where each group's sustained slowdowns most often
          began is in Values. */}
      <p className="explore-sentence">
        {label(focus)}: the typical finish took <strong>{timeDifference(focus.after20_delta_s)}</strong> after 20K than the same distance at early-race pace.
      </p>
      {raceDay && <p className="explore-note">{focus.temp_c == null ? 'Start-hour temperature is unavailable.' : `Start-hour temperature: ${Math.round(units === 'mi' ? focus.temp_c * 1.8 + 32 : focus.temp_c)}°${units === 'mi' ? 'F' : 'C'}.`} {focus.opening_net_m == null ? '' : `Net elevation change over the first 5K: ${elevationLabel(focus.opening_net_m, units)}.`}</p>}
      {chart}
      <Values id={`${id}-values`} caption={title}
        columns={[{ key: 'g', label: raceDay ? 'Race edition' : kind === 'weather' || kind === 'weather-profile' ? 'At the start' : kind === 'downhill' ? 'Opening' : 'Course', text: true },
          { key: 's', label: raceDay ? 'Slowdown rate in this edition' : 'Sustained slowdown' }, { key: 'o', label: 'Most often began' }, { key: 'l', label: 'Late-race pace' }, { key: 't', label: 'After 20K' }, { key: 'm', label: 'Median finish' }, { key: 'n', label: 'Finishes' }]}
        rows={[...shown].sort((a, b) => a[measure] - b[measure]).map(g => [label(g), percent(g.slowdown_pct), onsetText(g), paceChange(g.late_pct), timeDifference(g.after20_delta_s), clock(g.actual_finish_median_s, true), g.n.toLocaleString('en-US')])}
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
export type AllFinisherProps = {
  kind: AllFinisherKind; start: AllFinisherStart; title?: string; description?: string; archive?: boolean; related?: ReactNode; linkTerm?: boolean;
  /** An archive page's own view of the earlier-result comparison, drawn under the form's switch. */
  history?: ReactNode;
  /** Downhill starts: the opening band the explorer opens on (the page picks it from the data). */
  opening?: string;
  /**
   * What the explorer shows before the visitor changes anything: 'chart' the example's results, 'none' the selection
   * row alone, when the page's answer above already draws the example's chart. Any other selection shows its results;
   * the example set again shows one line back to the answer ('none').
   */
  untouched?: 'chart' | 'none';
};

export default function AllFinisherAnalysis({ history, ...props }: AllFinisherProps) {
  return <AllFinisherExplorer {...props} historyNode={history} />;
}

/** The explorer itself; `historyNode` is an archive page's own earlier-result view, drawn under the comparison switch. */
function AllFinisherExplorer({ kind, start, historyNode, title, description, archive = false, linkTerm = true, opening = ALL_FINISHER_DEFAULT.opening, untouched: untouchedView = 'chart' }: Omit<AllFinisherProps, 'history'> & {
  historyNode?: ReactNode;
}) {
  const { units } = useUnits();
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const base = useMemo<AllFinisherSelection>(() => ({ ...ALL_FINISHER_DEFAULT, opening }), [opening]);
  const [selection, setSelection] = useState<AllFinisherSelection>(base);
  const [draft, setDraft] = useState<AllFinisherSelection>(base);
  const [data, setData] = useState<AllFinisherEvidence | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [focusId, setFocusId] = useState(''), [comparisonId, setComparisonId] = useState('');
  const [focusDraft, setFocusDraft] = useState(''), [comparisonDraft, setComparisonDraft] = useState('');
  // The visitor (or the address) chose a selection: the example set again then reads as the answer above.
  const [chosen, setChosen] = useState(false);
  const hasHistory = historyNode != null;
  const all = selection.mode === 'all' || !hasHistory;
  const initial = allFinisherRow([start.initial], selection);
  useEffect(() => {
    const restore = () => { const p = new URLSearchParams(window.location.search); const next = readAllFinisherSelection(window.location.search, start, opening); setSelection(next); setDraft(next); setFocusId(p.get('focus') || ''); setComparisonId(p.get('compare') || ''); setFocusDraft(p.get('focus') || ''); setComparisonDraft(p.get('compare') || ''); p.delete('units'); setChosen(p.toString() !== ''); };
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, [start, opening]);
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
    setSelection(next); setDraft(next); setFocusId(nextFocus); setComparisonId(nextCompare); setChosen(true);
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
  // The selection row names only the choices that matter, the one that varies first: the opening band on downhill
  // starts, then the course; defaults ("All early paces", "All ages") are left out.
  const openingBand = kind === 'downhill' ? start.opening_bands.find(b => b.id === selection.opening) : undefined;
  const summary = [...(openingBand ? [`First 5K ${bandWords(openingBand.label)}`] : []), selection.city === 'All courses' ? 'All courses' : cityName(selection.city),
    ...(selection.early_pace === 'all' ? [] : [earlyPaceLabel(start.early_pace_bands.find(b => b.id === selection.early_pace)!, units)]), ...(selection.age === 'all' ? [] : [selection.age]),
    ...(selection.gender === 'all' ? [] : [selection.gender]), ...(all ? [] : ['With an earlier result'])].filter(Boolean).join(' · ');
  const same = (a: AllFinisherSelection, b: AllFinisherSelection) => (Object.keys(b) as (keyof AllFinisherSelection)[]).every(key => a[key] === b[key]);
  // The group followed and the comparison line as the form shows them (a blank draft is the view's default).
  const shownFocus = (id: string) => id || focus?.id || '', shownCompare = (id: string) => id || comparison?.id || 'none';
  const fallback = defaultFocus(groups, kind);
  // The untouched example: the page's answer already states the spread across courses or start temperatures.
  const untouched = same(selection, base) && (!focusId || focusId === fallback?.id) && !comparisonId;
  const head = !(untouched && (kind === 'courses' || kind === 'weather'));
  const shown = !untouched || untouchedView === 'chart';
  // Update comparison does something only once the form differs from the selection on screen.
  const ready = !same(draft, selection) || shownFocus(focusDraft) !== shownFocus(focusId) || (isProfileKind(kind) && shownCompare(comparisonDraft) !== shownCompare(comparisonId));
  // The comparison switch (archive pages only) is the form's first control.
  const modes = hasHistory ? <div className="explore-mode"><Segmented label="Choose the comparison" block value={all ? 'all' : 'history'} onChange={value => mode(value as 'all' | 'history')}
    options={[{ value: 'all', label: 'All finishes' }, { value: 'history', label: 'With an earlier result' }]} /><p className="field-hint">{all ? 'No previous race needed' : 'Compared with recorded race history'}</p></div> : null;
  return <div className="analysis-layout explorer af-explorer">
    {archive ? <header className="explorer-head"><h1 className="t-title">{title}</h1>{description ? <p className="t-body">{description}</p> : null}</header> : null}
    <MakeItYours id={`${formId}-miy`} summary={summary} busy={all && (pending || loading)}>
      <form className="explore-form" onSubmit={event => { event.preventDefault(); if (all && ready) apply(draft); }}>
        {modes}
        {all ? <Fragment key="all">
          <div className="explore-fields">
            {kind !== 'courses' && kind !== 'course-consistency' && kind !== 'course-profile' && <div className="field"><label className="field-label" htmlFor={field('course')}>Course</label><select id={field('course')} className="select" value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })}>{start.cities.map(city => <option key={city} value={city}>{cityName(city)}</option>)}</select></div>}
            <div className="field"><label className="field-label" htmlFor={field('early')}>Early-race pace</label><select id={field('early')} className="select" value={draft.early_pace} onChange={event => setDraft({ ...draft, early_pace: event.target.value })}>{start.early_pace_bands.map(band => <option key={band.id} value={band.id}>{earlyPaceLabel(band, units)}</option>)}</select></div>
            {kind === 'downhill' && <div className="field"><label className="field-label" htmlFor={field('opening')}>Opening pace</label><select id={field('opening')} className="select" value={draft.opening} onChange={event => setDraft({ ...draft, opening: event.target.value })}>{start.opening_bands.map(band => <option key={band.id} value={band.id}>{capital(bandWords(band.label))}</option>)}</select></div>}
            <div className="field"><label className="field-label" htmlFor={field('age')}>Age group</label><select id={field('age')} className="select" value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value })}>{start.ages.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></div>
            <div className="field"><label className="field-label" htmlFor={field('gender')}>Recorded gender</label><select id={field('gender')} className="select" value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}>{GENDER_ORDER(start.genders).map(gender => <option key={gender} value={gender}>{gender === 'all' ? 'All' : gender}</option>)}</select></div>
            {follows && focus && <div className="field"><label className="field-label" htmlFor={field('focus')}>{followLabel}</label><select id={field('focus')} className="select" value={focusDraft || focus.id} onChange={event => setFocusDraft(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{label(group)}</option>)}</select></div>}
            {isProfileKind(kind) && focus && <div className="field"><label className="field-label" htmlFor={field('compare')}>Compare pacing with</label><select id={field('compare')} className="select" value={comparisonDraft || comparison?.id || 'none'} onChange={event => setComparisonDraft(event.target.value)}><option value="none">No comparison line</option>{groups.filter(group => group.id !== (focusDraft || focus.id)).map(group => <option key={group.id} value={group.id}>{label(group)}</option>)}</select></div>}
          </div>
          <ExploreSubmit ready={ready} />
        </Fragment> : null}
      </form>
    </MakeItYours>
    {!all ? historyNode : <>
      <div className="sr-only" role="status">{pending || loading ? 'Loading your comparison.' : error ? '' : !chosen ? '' : focus ? `Comparison updated: ${summary}.` : 'Not enough results for this exact selection.'}</div>
      <div className="miy-results">
        {(pending || loading) && !row ? <p className="explore-state">Loading the comparison…</p>
          : error ? <div className="explore-state" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary is-compact" onClick={() => setRetry(value => value + 1)}>Try again</button></div>
          : untouched && chosen && untouchedView === 'none' ? <AnswerAbove />
          : !shown ? null
          : focus ? <AllFinisherResults groups={groups} kind={kind} start={start} units={units} focus={focus} comparison={comparison} head={head} followed={!!focusId} linkTerm={linkTerm} />
          : <div className="explore-state"><h2 className="explore-title">Not enough results for this exact comparison.</h2><p>Try a broader course, early pace, age or gender{kind === 'downhill' ? ', or another opening' : ''}.</p><button className="btn btn-secondary is-compact" type="button" onClick={() => apply(base, '', '')}>Reset the comparison</button></div>}
      </div>
    </>}
  </div>;
}
