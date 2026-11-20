'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useUnits } from './UnitsProvider';
import type { UnitSystem } from '@/lib/units';
import RunnerContext from './RunnerContext';
import KeypadHint from './KeypadHint';
import Arrow from './ui/Arrow';
import { LinkTerm } from './ui/TierTag';
import { keypadInput } from '@/lib/keypad';
import type { CopyEdition } from '@/lib/duplicate-editions-shared';
import type { ReportData } from '@/lib/report';
import type { LinkedYears } from '@/lib/report-year';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';
import { pacingPatternHref } from '@/lib/tools/links';
import { loadErrorText } from '@/lib/error-text';
import { POSSIBLE_MATCH, inline, possibleMatchCount } from '@/lib/tiers';
import {
  loadRunnerManifest, loadRunnerProfile, normalizeRunnerName, runnerProgression, runnerSearchPage, searchRunnerNames, RUNNER_PAGE_SIZE,
  type RunnerManifest, type RunnerMatch, type RunnerProfile, type RunnerRace, type RunnerSearchAllow, type RunnerSearchResult,
} from '@/lib/runner-search';
import ProfileView from './runner/ProfileView';
import { MatchRows, NoMatchNext, SearchMore, alikeRows, matchKey } from './runner/SearchResults';
import { NO_COPIES, RecordList, analysed, finishLabel, inCopyEdition, raceLabel } from './runner/records';

// The record pieces and the no-match block moved to components/runner/ with lookup version 2; they are still reached
// from here by the verifiers and scenarios that render them.
export { RunnerRecordDetails, RecordedDetails } from './runner/records';
export { NoMatchNext } from './runner/SearchResults';

const count = (value: number) => value.toLocaleString('en-US');
/** Above this many names the results ask for a first name, so a common surname never means paging through thousands. */
const NARROW_ABOVE = 100;
const errorMessage = (error: unknown) => loadErrorText(error, 'The records could not load. Please try again.');
/** How many matches a search found, in the bands analytics allows: never the names or the exact count. */
const resultBucket = (n: number) => n === 0 ? '0' : n === 1 ? '1' : n <= 5 ? '2-5' : '6+';
const MAX_QUERY = 120;

/**
 * Runner names never go in the page address. A search is kept in this tab's history entry (history.state.runnerQuery),
 * so Back, Forward and reload restore it without the name reaching a shared link, the host's logs or analytics.
 * Old links carried the name as ?q=; that value is still read once.
 */
function savedRunnerQuery(): string {
  const legacy = new URLSearchParams(window.location.search).get('q');
  const state: unknown = window.history.state;
  const kept = state && typeof state === 'object' ? (state as { runnerQuery?: unknown }).runnerQuery : undefined;
  return (legacy ?? (typeof kept === 'string' ? kept : '')).slice(0, MAX_QUERY);
}

/** Takes an old ?q= out of the address, keeping the search in this history entry only. */
function stripLegacyQuery(value: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('q')) return;
  url.searchParams.delete('q');
  // A fresh state object: Next.js's patched replaceState then copies its own router state and adopts the clean address.
  window.history.replaceState({ runnerQuery: value }, '', url.pathname + url.search + url.hash);
}

/**
 * "Only know your finish time?": a time typed here opens the pacing-pattern analysis for finishes near it, at the whole
 * minute at or below it (the rule for every link between tools). The time goes only into that page's own address, which
 * analytics never reads. The tools' time reader loads on the first press, so the page does not carry it; without
 * JavaScript the form opens the analysis, which asks for the time itself.
 */
export function FinishTimeStart() {
  const { units } = useUnits();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  return <form className="runner-start runner-start-time" action="/analyses/pacing-pattern" method="get" onSubmit={async event => {
    event.preventDefault();
    let seconds: number | null = null;
    try { seconds = text.trim() ? (await import('@/lib/tools/time')).parseDuration(text, 'race') : null; } catch { setError('The time could not be read. Reload the page and try again.'); return; }
    const href = seconds === null ? null : pacingPatternHref(Math.floor(seconds / 60));
    if (!href) { setError('Enter a finish time from 1:30:00 to 12:00:00, such as 4:05:30.'); return; }
    window.location.assign(unitHref(href, units));
  }}>
    <label htmlFor="runner-finish-time"><b>Only know your finish time?</b><span>Type it to see how finishes near it were paced.</span></label>
    <div className="runner-start-fields"><input id="runner-finish-time" className="input" inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="4:05:30" value={text} aria-invalid={error ? true : undefined} aria-describedby={error ? 'runner-finish-time-error' : undefined} onChange={event => { setText(keypadInput(event.target, event.nativeEvent)); setError(''); }} /><button className="btn btn-secondary runner-start-go" type="submit">See finishes</button></div>
    <KeypadHint block />
    {error && <p className="runner-note runner-start-error" id="runner-finish-time-error" role="alert">{error}</p>}
  </form>;
}

/**
 * The selected races. Marathon records with their own pacing view lead, in the race view (RunnerContext). Every other
 * selected record is listed with what was recorded: marathon records without a pacing report, with the lookup's reason,
 * and half marathons, which are listed with their finish and labels. The two distances are never set in one list or one
 * figure, and a possible match the visitor ticked is named as one.
 */
export function SelectedAnalysis({ races, manifest, units, copyEditions = NO_COPIES, report, listed, wet, years }: {
  races: RunnerRace[]; manifest: RunnerManifest; units: UnitSystem; copyEditions?: readonly CopyEdition[]; report?: ReportData; years?: LinkedYears;
  /** Cities whose route profile reads the water under a bridge: the view shows no climb for them. */
  wet?: readonly string[];
  /** The keys of the records the open profile above already lists with their tags and details: the analysis does not list them again. */
  listed?: ReadonlySet<string>;
}) {
  // Copy-edition records join the records without a pacing view: no best, count, year span, change or table row comes from them.
  const pacing = useMemo(() => races.filter(race => analysed({ race, manifest }, copyEditions)), [races, manifest, copyEditions]);
  const progression = useMemo(() => runnerProgression(pacing, manifest), [pacing, manifest]);
  const marathons = races.filter(race => race.distance === 'marathon' && !analysed({ race, manifest }, copyEditions));
  const halves = races.filter(race => race.distance === 'half');
  const possible = races.filter(race => race.possible).length;
  // What the visitor's own tick added: said wherever the selection is summed up, never left to read as the runner's.
  const includes = possible ? <p className="runner-note runner-includes">Includes <LinkTerm>{possibleMatchCount(possible, count)}</LinkTerm> you selected.</p> : null;
  if (!progression) {
    const copies = races.filter(race => race.eligible && inCopyEdition({ race, manifest }, copyEditions)).length;
    const why = halves.length === races.length ? 'Half marathons are listed with their recorded finish and labels.'
      : copies === races.length ? 'These records are shown as recorded times only, without pacing or peer comparisons.'
        : copies || halves.length ? 'None of these records can support pacing or peer comparisons. Each race shows its status.'
          : 'These records need more complete or verified data before they can support pacing or peer comparisons. Each race explains what is missing or awaiting review.';
    return <section className="runner-analysis" aria-labelledby="runner-analysis-title">
      <header className="runner-analysis-head"><h2 id="runner-analysis-title">Your race records are here.</h2>
        <p>{`The recorded names, races, finish times and checkpoints are below. ${why}`}</p>{includes}</header>
      {marathons.length > 0 && <>{halves.length > 0 && <h3 className="runner-h runner-records-h">Marathons</h3>}<RecordList races={marathons} manifest={manifest} copyEditions={copyEditions} /></>}
      {halves.length > 0 && <>{marathons.length > 0 && <h3 className="runner-h runner-records-h">Half marathons</h3>}<RecordList races={halves} manifest={manifest} copyEditions={copyEditions} /></>}
    </section>;
  }
  // The records without a pacing view that are not already on screen in the profile (one chosen from another match, say).
  const unlisted = marathons.filter(race => !listed?.has(race.key)), unlistedHalves = halves.filter(race => !listed?.has(race.key));
  // The focus race leads, in the view's own heading (or, with two or more, its select): round 4 cut the progression
  // card, its sentence and the race table (the table's numbers are in the comparison's All numbers).
  // A half ticked beside marathons is listed, never compared with them (m11, November 20, 2026: it dropped out of the
  // analysis without a word): the summary says so whenever one is selected.
  const halvesApart = halves.length ? <p className="runner-note runner-includes">{halves.length === 1 ? 'The half marathon you selected is listed, but it is not part of the comparison, which holds marathons only.' : `The ${count(halves.length)} half marathons you selected are listed, but they are not part of the comparison, which holds marathons only.`}</p> : null;
  return <section className="runner-analysis" aria-label={progression.valid.length === 1 ? 'The selected race' : 'The selected races'}>
    {includes}{halvesApart}
    <RunnerContext races={pacing} manifest={manifest} units={units} copyEditions={copyEditions} report={report} wet={wet} years={years} />
    {unlisted.length > 0 && <section className="runner-limited" aria-labelledby="runner-limited-title"><h3 id="runner-limited-title" className="runner-h">{`${count(unlisted.length)} selected ${unlisted.length === 1 ? 'record has' : 'records have'} limited analysis`}</h3><RecordList races={unlisted} manifest={manifest} copyEditions={copyEditions} /></section>}
    {unlistedHalves.length > 0 && <section className="runner-limited" aria-labelledby="runner-halves-title"><h3 id="runner-halves-title" className="runner-h">{`${count(unlistedHalves.length)} selected half ${unlistedHalves.length === 1 ? 'marathon' : 'marathons'}`}</h3><RecordList races={unlistedHalves} manifest={manifest} copyEditions={copyEditions} /></section>}
  </section>;
}

/**
 * The name search, its records and the selected races' analysis. The page (app/runners/page.tsx) writes the heading and
 * passes the ways in without a name (`starts`): under the search until one is made, then under the matches until a race
 * is chosen (a search that finds none has its own next steps); `report` is what the race report needs from the build.
 * The field and its button work from the first paint: a search made while the search data still loads waits for it.
 */
export default function RunnerSearch({ copyEditions = NO_COPIES, report, starts, wet, years }: { copyEditions?: readonly CopyEdition[]; report?: ReportData; starts?: ReactNode; wet?: string[]; years?: LinkedYears }) {
  const { units } = useUnits();
  const [manifest, setManifest] = useState<RunnerManifest | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [manifestRetry, setManifestRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  const [result, setResult] = useState<RunnerSearchResult | null>(null);
  // The steps the visitor pressed for in this search (a larger download): a new search starts with none.
  const [allow, setAllow] = useState<RunnerSearchAllow>({});
  const [moreLoading, setMoreLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [profile, setProfile] = useState<RunnerProfile | null>(null);
  // The search row that opened the profile, and the one that is loading.
  const [opened, setOpened] = useState<RunnerMatch | null>(null);
  const [profileLoading, setProfileLoading] = useState<string | null>(null);
  const [profileError, setProfileError] = useState('');
  // Once a match is opened the results fold to one row (the name, its count, Change), so the profile it opened is the
  // next thing on screen, not under 25 rows of other names (round 5); Change unfolds them.
  const [listOpen, setListOpen] = useState(true);
  const [selected, setSelected] = useState<RunnerRace[]>([]);
  const [confirmed, setConfirmed] = useState<RunnerRace[] | null>(null);
  // Once the selection is viewed its bar folds to a quiet row ("3 races selected · Edit"): the orange button comes back
  // only when the selection changes (which sets the view aside), and Edit opens the chips to remove one.
  const [editing, setEditing] = useState(false);
  const searchController = useRef<AbortController | null>(null);
  const profileController = useRef<AbortController | null>(null);
  const profileHeading = useRef<HTMLHeadingElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const matches = result?.matches ?? [];

  const runSearch = useCallback(async (value: string, source: RunnerManifest) => {
    searchController.current?.abort(); profileController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setProfile(null); setOpened(null); setProfileLoading(null); setProfileError(''); setResult(null); setAllow({}); setMoreLoading(false); setPage(0); setSearchError(''); setListOpen(true);
    if (!normalizeRunnerName(value)) { setSearched(''); setSearchError('Enter a recorded name.'); setSearchLoading(false); return; }
    setSearched(value.trim()); setSearchLoading(true);
    trackAnalytics('runner_search_submitted', {});
    try {
      const found = await searchRunnerNames(value, source, controller.signal);
      if (!controller.signal.aborted) { setResult(found); setSearchLoading(false); trackAnalytics('runner_search_completed', { outcome: found.matches.length ? 'matches' : 'no_matches', results: resultBucket(found.matches.length) }); }
    } catch (error) { if (!controller.signal.aborted) { setSearchError(errorMessage(error)); setSearchLoading(false); trackAnalytics('runner_search_completed', { outcome: 'error' }); } }
  }, []);
  /** A press for a step the search did not take by itself: the same search again, with that step allowed. It is no new search, so it sends no event. */
  const loadMore = async (step: 'whole' | 'beginnings') => {
    if (!manifest || !searched) return;
    searchController.current?.abort(); profileController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    const allowed = { ...allow, [step]: true };
    setAllow(allowed); setMoreLoading(true); setSearchError(''); setProfile(null); setOpened(null); setProfileLoading(null); setProfileError(''); setListOpen(true);
    try {
      const found = await searchRunnerNames(searched, manifest, controller.signal, allowed);
      if (!controller.signal.aborted) { setResult(found); setPage(0); setMoreLoading(false); }
    } catch (error) { if (!controller.signal.aborted) { setSearchError(errorMessage(error)); setMoreLoading(false); } }
  };

  useEffect(() => {
    const controller = new AbortController(); setManifestError('');
    loadRunnerManifest(controller.signal).then(source => {
      if (controller.signal.aborted) return;
      setManifest(source);
      // Only a saved search fills the field, so a name typed while the search data loads is kept.
      const initial = savedRunnerQuery();
      if (initial) { setQuery(initial); void runSearch(initial, source); }
    }).catch(error => { if (!controller.signal.aborted) { setManifestError(errorMessage(error)); setWaiting(null); } });
    return () => { controller.abort(); searchController.current?.abort(); profileController.current?.abort(); };
  }, [manifestRetry, runSearch]);
  // A search pressed before the search data arrived runs as soon as it does.
  useEffect(() => {
    if (!manifest || waiting === null) return;
    const value = waiting; setWaiting(null); void runSearch(value, manifest);
  }, [manifest, waiting, runSearch]);
  useEffect(() => {
    // An old ?q= link: clean the address straight away. The timeout lets Next.js finish patching history on first load,
    // so its router adopts the clean address instead of restoring the old one.
    const initial = savedRunnerQuery();
    const timer = window.setTimeout(() => stripLegacyQuery(initial), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!manifest) return;
    let timer = 0;
    const restore = () => {
      const value = savedRunnerQuery();
      window.clearTimeout(timer); timer = window.setTimeout(() => stripLegacyQuery(value), 0);
      setQuery(value); if (value) void runSearch(value, manifest);
      else { searchController.current?.abort(); profileController.current?.abort(); setSearched(''); setResult(null); setSearchError(''); setSearchLoading(false); setMoreLoading(false); setProfileLoading(null); setProfileError(''); setProfile(null); setOpened(null); }
    };
    window.addEventListener('popstate', restore); return () => { window.clearTimeout(timer); window.removeEventListener('popstate', restore); };
  }, [manifest, runSearch]);

  const openProfile = async (row: RunnerMatch) => {
    if (!manifest) return;
    profileController.current?.abort(); const controller = new AbortController(); profileController.current = controller;
    setProfile(null); setOpened(null); setProfileLoading(matchKey(row)); setProfileError('');
    try {
      const value = await loadRunnerProfile(row.shard, row.position, manifest, controller.signal);
      if (!controller.signal.aborted) { setProfile(value); setOpened(row); setProfileLoading(null); setListOpen(false); trackAnalytics('runner_profile_opened', {}); }
    } catch (error) { if (!controller.signal.aborted) { setProfileError(errorMessage(error)); setProfileLoading(null); } }
  };
  // The opened profile's heading takes focus; with the list folded to one row above it, the focus scroll brings it up
  // under the header (its scroll margin).
  useEffect(() => { if (profile) profileHeading.current?.focus(); }, [profile]);
  // Once the chosen races' analysis is on screen, focus moves to its first heading, as the profile step's does, so a
  // keyboard or screen-reader user lands where the page scrolled (the scroll itself is the View button's).
  useEffect(() => {
    if (!confirmed) return;
    const heading = analysisRef.current?.querySelector<HTMLElement>('h2');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [confirmed]);
  // A race is one record: its key names its source database and id, so a marathon and a half never share one.
  const toggleRace = (race: RunnerRace) => {
    setSelected(previous => previous.some(row => row.key === race.key) ? previous.filter(row => row.key !== race.key) : [...previous, race]);
    setConfirmed(null); setEditing(false);
  };
  const visibleMatches = runnerSearchPage(matches, page);
  const alike = useMemo(() => manifest ? alikeRows(matches, manifest) : new Map<string, string>(), [matches, manifest]);
  // Only with matches: the empty page renders no number (a throwing toLocaleString must fail the results, not hydration).
  const namesFound = matches.length ? `${count(matches.length)} matching ${matches.length === 1 ? 'name' : 'names'}` : '';
  const pages = Math.ceil(matches.length / RUNNER_PAGE_SIZE);
  const selectedKeys = useMemo(() => new Set(selected.map(race => race.key)), [selected]);
  // The records the open profile lists, each with its tags and (without a pacing view) its details.
  const listed = useMemo(() => new Set((profile?.races ?? []).map(race => race.key)), [profile]);
  const busy = searchLoading || waiting !== null;
  // A search that finds no name sets the earlier selection and its analysis aside (kept in state), so neither reads as
  // that search's result or covers its next steps; the next search that finds a name brings the selection bar back.
  const noMatch = !!manifest && !!searched && !searchLoading && !searchError && !!result && !matches.length;
  // Nothing listed and nothing more a press could list: the search's own next steps show.
  const deadEnd = noMatch && !result?.more;
  const possibleSelected = selected.filter(race => race.possible).length;
  // Only with a selection, as namesFound above: the empty page renders no number.
  const selectionCount = !selected.length ? '' : `${count(selected.length)} ${selected.length === 1 ? 'race' : 'races'} selected${possibleSelected ? ` · includes ${possibleMatchCount(possibleSelected, count)} you selected` : ''}`;
  const opening = result?.stage === 2 ? (allow.beginnings ? 'Names that start with these words. ' : 'No recorded name has exactly these words, so these are names that start with them. ') : '';

  return <>
    <div className="runner-split">
    <div className="runner-side">
    <form className="runner-search-form ph-no-capture" role="search" onSubmit={event => {
      event.preventDefault();
      // The name stays in this history entry, never in the address (see savedRunnerQuery). Repeating a search adds no entry.
      const value = query.trim().slice(0, MAX_QUERY);
      const address = new URL(window.location.href); address.searchParams.delete('q');
      const href = unitHref(address.pathname + address.search + address.hash, units);
      const state: unknown = window.history.state;
      if (state && typeof state === 'object' && (state as { runnerQuery?: unknown }).runnerQuery === value) window.history.replaceState({ runnerQuery: value }, '', href);
      else window.history.pushState({ runnerQuery: value }, '', href);
      if (manifest) void runSearch(query, manifest);
      else { if (manifestError) setManifestRetry(attempt => attempt + 1); setWaiting(query); }
    }}><label htmlFor="runner-name" className="runner-search-label">Recorded name</label><div className="runner-search-fields"><input id="runner-name" className="input" type="search" enterKeyHint="search" autoComplete="name" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="First and last name" aria-describedby="runner-name-help" /><button className="btn btn-secondary runner-search-go" type="submit" aria-busy={busy || undefined}>{busy ? 'Searching…' : 'Find races'}</button></div><p id="runner-name-help" className="runner-note">Marathons and half marathons. Any order, with or without accents; a first name and a surname work best.</p></form>
    {waiting !== null && <p className="runner-note runner-status" role="status">Finding matching names…</p>}
    {manifestError && <div className="runner-error" role="alert"><p>{manifestError}</p><button type="button" className="btn btn-secondary is-compact" onClick={() => setManifestRetry(value => value + 1)}>Try again</button></div>}
    {searchError && <div className="runner-error" role="alert"><p>{searchError}</p>{searched && <button type="button" className="btn btn-secondary is-compact" onClick={() => manifest && void runSearch(searched, manifest)}>Try again</button>}</div>}
    {searchLoading && <p className="runner-note runner-status" role="status">Finding matching names…</p>}
    </div>
    <div className="runner-main">
    {!searched && starts}
    {manifest && searched && result && !searchLoading && !searchError && <section className="runner-results ph-no-capture" aria-labelledby="runner-results-title">{profile && !listOpen && matches.length > 0
      ? <p className="runner-results-row"><span id="runner-results-title"><b>{searched}</b> · {namesFound}</span><button type="button" className="btn btn-tertiary" onClick={() => setListOpen(true)}>Change</button></p>
      : <>
      <h2 id="runner-results-title" className="runner-h"><span role="status">{matches.length ? namesFound : result.more ? 'No name listed yet' : 'No matching recorded name'}</span></h2>
      <p className="runner-note">{matches.length ? `${opening}For “${searched}”. People can share a name: check the races before combining them.` : deadEnd && !result.capped ? 'Try the spelling on the original result, a surname, or fewer name parts.' : `For “${searched}”.`}</p>
      {/* Only for one typed word: a third word would hide the runner's own two-word records (72% of recorded names have
          at most two words), so a name of two or more words gets no hint. */}
      {matches.length > NARROW_ABOVE && !result.alone && new Set(normalizeRunnerName(searched).split(' ').filter(Boolean)).size < 2 && <p className="runner-note runner-narrow">Add a first name to narrow them.</p>}
      {/* Each row as a runner recognizes a race: one race by its label, year and distance ("Washington 2014 · marathon"),
          several by their counts, each distance apart, and their span. */}
      {matches.length > 0 && <MatchRows rows={visibleMatches} manifest={manifest} openKey={opened ? matchKey(opened) : null} loadingKey={profileLoading} onOpen={row => void openProfile(row)} alike={alike} />}
      {pages > 1 && <nav className="runner-pagination" aria-label="Search result pages"><button type="button" className="btn btn-secondary is-compact" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>{count(page * RUNNER_PAGE_SIZE + 1)}–{count(Math.min(matches.length, (page + 1) * RUNNER_PAGE_SIZE))} of {count(matches.length)}</span><button type="button" className="btn btn-secondary is-compact" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
      <SearchMore result={result} searched={searched} busy={moreLoading} onMore={step => void loadMore(step)} />
      {deadEnd && <NoMatchNext />}
    </>}</section>}
    {profileError && <div className="runner-error" role="alert"><p>{profileError} Select the match again to retry.</p></div>}
    <div id="runner-profile" className="ph-no-capture">{manifest && profile && opened && <ProfileView profile={profile} manifest={manifest} opened={opened.name} copyEditions={copyEditions} selected={selectedKeys} onToggle={toggleRace} headingRef={profileHeading} />}</div>
    {searched && matches.length > 0 && !searchLoading && !searchError && !selected.length && !confirmed && starts}
    {manifest && selected.length > 0 && !noMatch && (confirmed && !editing
      ? <section className="runner-selection is-quiet ph-no-capture" aria-labelledby="runner-selection-title"><p className="runner-selection-row"><span id="runner-selection-title">{selectionCount}</span><button type="button" className="btn btn-tertiary runner-edit" aria-expanded={false} onClick={() => setEditing(true)}>Edit</button></p></section>
      : <section className="runner-selection ph-no-capture" aria-labelledby="runner-selection-title"><h2 id="runner-selection-title" className="sr-only">{selectionCount}</h2><ul className="runner-chips">{selected.map(race => <li key={race.key}><span>{raceLabel(race, manifest)} · {finishLabel(race)}{race.distance === 'half' ? <small> · half marathon</small> : !analysed({ race, manifest }, copyEditions) ? <small> · recorded times</small> : null}{race.possible ? <small> · {inline(POSSIBLE_MATCH)}</small> : null}</span><button type="button" onClick={() => toggleRace(race)} aria-label={`Remove ${race.name}, ${raceLabel(race, manifest)}, record ${race.key}`}><span aria-hidden="true" className="runner-chip-x" /></button></li>)}</ul>{possibleSelected ? <p className="runner-note runner-selection-note">Includes {possibleMatchCount(possibleSelected, count)} you selected.</p> : null}<div className="runner-selection-actions">{confirmed
        ? <button className="btn btn-tertiary runner-done" type="button" aria-expanded={true} onClick={() => setEditing(false)}>Done</button>
        : <button className="btn btn-primary is-compact button-primary" type="button" onClick={() => { trackAnalytics('race_comparison_opened', { selection: selected.length === 1 ? 'one' : 'multiple', availability: selected.every(race => analysed({ race, manifest }, copyEditions)) ? 'eligible' : selected.some(race => analysed({ race, manifest }, copyEditions)) ? 'mixed' : 'limited' }); setConfirmed([...selected]); setEditing(false); requestAnimationFrame(() => analysisRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })); }}>{selected.length === 1 ? 'View the selected race' : `View ${count(selected.length)} selected races`}<Arrow /></button>}<button className="btn btn-tertiary runner-clear" type="button" onClick={() => { setSelected([]); setConfirmed(null); setEditing(false); }}>Clear</button></div></section>)}
    </div>
    </div>
    {/* The analysis reads under the search and what it found, outside their column (from 900 px it is wider, on the
        same axis). */}
    <div ref={analysisRef} className="runner-reading ph-no-capture">{confirmed && manifest && !noMatch && <SelectedAnalysis races={confirmed} manifest={manifest} units={units} copyEditions={copyEditions} report={report} listed={listed} wet={wet} years={years} />}</div>
  </>;
}
