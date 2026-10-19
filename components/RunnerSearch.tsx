'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { matLabel, type UnitSystem } from '@/lib/units';
import RunnerContext from './RunnerContext';
import KeypadHint from './KeypadHint';
import Arrow from './ui/Arrow';
import { keypadInput } from '@/lib/keypad';
import { copyEditionOf, isCopyEdition, type CopyEdition } from '@/lib/duplicate-editions-shared';
import type { ReportData } from '@/lib/report';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';
import { pacingPatternHref } from '@/lib/tools/links';
import {
  displayName, loadRunnerManifest, loadRunnerProfile, normalizeRunnerName, runnerDuration, runnerProgression, runnerSearchPage, searchRunnerNames, RUNNER_PAGE_SIZE,
  type RunnerManifest, type RunnerMatch, type RunnerProfile, type RunnerRace,
} from '@/lib/runner-search';

const count = (value: number) => value.toLocaleString('en-US');
/** Above this many groups the results ask for a first name, so a common surname never means paging through thousands. */
const NARROW_ABOVE = 100;
/** A row's name, its country code quiet after it ("Brian Suozzo · USA"). */
const shownName = (name: string) => { const [person, country] = displayName(name).split(' · '); return country ? <>{person}<span className="runner-country"> · {country}</span></> : person; };
const raceLabel = (race: RunnerRace, manifest: RunnerManifest) => {
  const edition = manifest.editions[race.edition];
  return `${edition.city === 'New York' ? 'New York City' : edition.city} ${edition.year}`;
};
/** A record's finish as recorded, in the page's one clock: a recorded "03:44:00" loses its leading zero, as "3:44:00". */
const finishLabel = (race: RunnerRace) => (race.raw_times?.[8] || runnerDuration(race.times[8])).replace(/^0(\d:)/, '$1');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The records could not load. Please try again.';
/** How many matches a search found, in the bands analytics allows: never the names or the exact count. */
const resultBucket = (n: number) => n === 0 ? '0' : n === 1 ? '1' : n <= 5 ? '2-5' : '6+';
const MAX_QUERY = 120;
const NO_COPIES: CopyEdition[] = [];
/** A copy edition (lib/duplicate-editions-shared.ts) repeats another year's field, so its records show recorded times only. */
const inCopyEdition = (race: RunnerRace, manifest: RunnerManifest, copies: readonly CopyEdition[]) => isCopyEdition(manifest.editions[race.edition], copies);
/** A race the pacing and comparison views use: eligible, and not in a copy edition. */
const analysed = (race: RunnerRace, manifest: RunnerManifest, copies: readonly CopyEdition[]) => race.eligible && !inCopyEdition(race, manifest, copies);

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
 * A held record's short tag, from the runner lookup's own record-level reasons (analysis/build_runner_lookup.py); an
 * edition-level hold, or any other reason, is "Limited analysis". The full reason is in the record's disclosure.
 */
function limitedTag(reason: string | null): string {
  if (reason === 'One or more checkpoint times are missing or could not be parsed.') return 'Limited: missing checkpoints';
  if (reason === 'Checkpoint times are not strictly increasing.') return 'Limited: times out of order';
  return 'Limited analysis';
}

/**
 * One recorded race as a row: the race and year, its recorded finish, and one short tag ("Pacing analysis", "Recorded
 * times only" for a copy edition, or why its analysis is limited). The recorded name, age, gender and the full reason
 * are in the record's "Recorded checkpoints" disclosure (RecordedCheckpoints).
 */
export function RunnerRecordDetails({ race, manifest, copyEditions = NO_COPIES }: { race: RunnerRace; manifest: RunnerManifest; copyEditions?: readonly CopyEdition[] }) {
  const copy = race.eligible && !!copyEditionOf(manifest.editions[race.edition], copyEditions);
  return <><strong>{raceLabel(race, manifest)}</strong><span className="runner-recorded-finish"><span className="sr-only">Recorded finish: </span>{finishLabel(race)}</span><span className={copy ? 'runner-ineligible runner-copy' : race.eligible ? 'runner-eligible' : 'runner-ineligible'}>{copy ? 'Recorded times only' : race.eligible ? 'Pacing analysis' : limitedTag(race.reason)}</span></>;
}

/**
 * A record with limited analysis, opened: the name, race, age and gender as recorded, why its analysis is limited (a
 * copy edition's line only where `explainCopy`; the analysis view says it once), its nine recorded checkpoints and
 * its record number.
 */
export function RecordedCheckpoints({ race, manifest, copyEditions = NO_COPIES, explainCopy = true }: { race: RunnerRace; manifest: RunnerManifest; copyEditions?: readonly CopyEdition[]; explainCopy?: boolean }) {
  const copy = race.eligible && !!copyEditionOf(manifest.editions[race.edition], copyEditions);
  return <details className="runner-raw values"><summary><span>Recorded checkpoints</span><span className="values-glyph" aria-hidden="true" /></summary>
    <p className="runner-note">{race.name || 'Name not recorded'} · {manifest.editions[race.edition].race} · {race.age === null ? 'Age not recorded' : `Recorded age ${race.age}${race.age < 18 || race.age > 89 ? ' (outside the usable age range)' : ''}`} · {race.sex ? `Recorded gender ${race.sex}` : 'Gender not recorded'}</p>
    {!race.eligible ? <p className="runner-note">{race.reason || 'The timings or edition need further verification.'} Pacing and peer comparisons are unavailable for this record.</p> : copy && explainCopy ? <p className="runner-note">Pacing and peer comparisons are unavailable for this record.</p> : null}
    <div className="runner-table-wrap table-wrap"><table className="table"><caption className="sr-only">Recorded checkpoints for record {race.id}</caption><thead><tr><th scope="col">Checkpoint</th><th scope="col">Recorded elapsed time</th></tr></thead><tbody>{manifest.points_km.map((end, i) => <tr key={end}><th scope="row">{matLabel(end)}</th><td>{race.raw_times?.[i] || runnerDuration(race.times[i])}</td></tr>)}</tbody></table></div><p className="runner-note">Record {race.id}.</p></details>;
}

function LimitedRecords({ races, manifest, copyEditions }: { races: RunnerRace[]; manifest: RunnerManifest; copyEditions: readonly CopyEdition[] }) {
  return <ul className="runner-races runner-limited-records">{races.map(race => <li className="runner-race" key={race.id}><div className="runner-race-row"><span className="runner-race-body"><RunnerRecordDetails race={race} manifest={manifest} copyEditions={copyEditions} /></span></div><RecordedCheckpoints race={race} manifest={manifest} copyEditions={copyEditions} explainCopy={false} /></li>)}</ul>;
}

/** The marathons the search covers and their recorded years, from the search data already on the page. */
function coveredRaces(manifest: RunnerManifest) {
  const races = new Map<string, Set<number>>();
  for (const edition of manifest.editions) races.set(edition.race, (races.get(edition.race) ?? new Set<number>()).add(edition.year));
  return [...races].map(([race, years]) => ({ name: race.replace(/ Marathon$/, ''), first: Math.min(...years), last: Math.max(...years), years: years.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * After a search finds no name: three ways on that need no name, then which marathons were searched. The links are
 * fixed addresses, so the search text never travels with them.
 */
export function NoMatchNext({ manifest }: { manifest: RunnerManifest }) {
  const races = useMemo(() => coveredRaces(manifest), [manifest]);
  return <div className="runner-nomatch">
    <nav className="runner-nomatch-next" aria-label="Start without a name"><ul className="runner-rows">
      <li><Link className="runner-row" href="/analyses/finish-time-context"><b>Compare a finish time</b><span>Where a time falls among comparable recorded finishes.</span><Arrow /></Link></li>
      <li><Link className="runner-row" href="/tools/split-check"><b>Have your splits? Check them</b><span>Paste your mat times to see how you paced.</span><Arrow /></Link></li>
      <li><Link className="runner-row" href="/request-analysis"><b>Ask for your race</b><span>Tell Andrew which marathon or year is missing.</span><Arrow /></Link></li>
    </ul></nav>
    <details className="runner-covered values"><summary><span>The {count(races.length)} marathons searched</span><span className="values-glyph" aria-hidden="true" /></summary>
      <ul>{races.map(race => <li key={race.name}><span>{race.name}</span><small>{race.first === race.last ? race.first : `${race.first}–${race.last}`} · {count(race.years)} {race.years === 1 ? 'year' : 'years'}</small></li>)}</ul>
    </details>
  </div>;
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

export function SelectedAnalysis({ races, manifest, units, copyEditions = NO_COPIES, report, listed, wet }: {
  races: RunnerRace[]; manifest: RunnerManifest; units: UnitSystem; copyEditions?: readonly CopyEdition[]; report?: ReportData;
  /** Cities whose route profile reads the water under a bridge: the view shows no climb for them. */
  wet?: readonly string[];
  /** Records the open profile above already lists with their tags and checkpoints: the analysis does not list them again. */
  listed?: ReadonlySet<number>;
}) {
  // Copy-edition records join the limited records: no best, count, year span, change or table row comes from them.
  const progression = useMemo(() => runnerProgression(races.filter(race => !inCopyEdition(race, manifest, copyEditions)), manifest), [races, manifest, copyEditions]);
  const limited = races.filter(race => !analysed(race, manifest, copyEditions));
  // The limited records not already on screen in the profile (one chosen from another match, say).
  const unlisted = limited.filter(race => !listed?.has(race.id));
  if (!progression) {
    const copies = races.filter(race => race.eligible && inCopyEdition(race, manifest, copyEditions)).length;
    const why = copies === races.length ? 'These records are shown as recorded times only, without pacing or peer comparisons.'
      : copies ? 'None of these records can support pacing or peer comparisons. Each race shows its status.'
      : 'These records need more complete or verified data before they can support pacing or peer comparisons. Each race explains what is missing or awaiting review.';
    return <section className="runner-analysis" aria-labelledby="runner-analysis-title">
      <header className="runner-analysis-head"><h2 id="runner-analysis-title">Your race records are here.</h2>
        <p>{`The recorded names, races, finish times and checkpoints are below. ${why}`}</p></header>
      <LimitedRecords races={races} manifest={manifest} copyEditions={copyEditions} />
    </section>;
  }
  // The focus race leads, in the view's own heading (or, with two or more, its select): round 4 cut the progression
  // card, its sentence and the race table (the table's numbers are in the comparison's All numbers).
  return <section className="runner-analysis" aria-label={progression.valid.length === 1 ? 'The selected race' : 'The selected races'}>
    <RunnerContext races={races} manifest={manifest} units={units} copyEditions={copyEditions} report={report} wet={wet} />
    {unlisted.length > 0 && <section className="runner-limited" aria-labelledby="runner-limited-title"><h3 id="runner-limited-title" className="runner-h">{`${count(unlisted.length)} selected ${unlisted.length === 1 ? 'record has' : 'records have'} limited analysis`}</h3><LimitedRecords races={unlisted} manifest={manifest} copyEditions={copyEditions} /></section>}
  </section>;
}

/**
 * The name search, its records and the selected races' analysis. The page (app/runners/page.tsx) writes the heading and
 * passes the ways in without a name (`starts`): under the search until one is made, then under the matches until a race
 * is chosen (a search that finds none has its own next steps); `report` is what the race report needs from the build.
 * The field and its button work from the first paint: a search made while the search data still loads waits for it.
 */
export default function RunnerSearch({ copyEditions = NO_COPIES, report, starts, wet }: { copyEditions?: CopyEdition[]; report?: ReportData; starts?: ReactNode; wet?: string[] }) {
  const { units } = useUnits();
  const [manifest, setManifest] = useState<RunnerManifest | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [manifestRetry, setManifestRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  const [matches, setMatches] = useState<RunnerMatch[]>([]);
  const [page, setPage] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [profile, setProfile] = useState<RunnerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<number | null>(null);
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

  const runSearch = useCallback(async (value: string, source: RunnerManifest) => {
    searchController.current?.abort(); profileController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setProfile(null); setProfileLoading(null); setProfileError(''); setMatches([]); setPage(0); setSearchError(''); setListOpen(true);
    if (!normalizeRunnerName(value)) { setSearched(''); setSearchError('Enter a recorded name or the beginning of a name.'); setSearchLoading(false); return; }
    setSearched(value.trim()); setSearchLoading(true);
    trackAnalytics('runner_search_submitted', {});
    try {
      const results = await searchRunnerNames(value, source, controller.signal);
      if (!controller.signal.aborted) { setMatches(results); setSearchLoading(false); trackAnalytics('runner_search_completed', { outcome: results.length ? 'matches' : 'no_matches', results: resultBucket(results.length) }); }
    } catch (error) { if (!controller.signal.aborted) { setSearchError(errorMessage(error)); setSearchLoading(false); trackAnalytics('runner_search_completed', { outcome: 'error' }); } }
  }, []);

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
      else { searchController.current?.abort(); profileController.current?.abort(); setSearched(''); setMatches([]); setSearchError(''); setSearchLoading(false); setProfileLoading(null); setProfileError(''); setProfile(null); }
    };
    window.addEventListener('popstate', restore); return () => { window.clearTimeout(timer); window.removeEventListener('popstate', restore); };
  }, [manifest, runSearch]);

  const openProfile = async (id: number) => {
    if (!manifest) return;
    profileController.current?.abort(); const controller = new AbortController(); profileController.current = controller;
    setProfile(null); setProfileLoading(id); setProfileError('');
    try {
      const value = await loadRunnerProfile(id, manifest, controller.signal);
      if (!controller.signal.aborted) { setProfile(value); setProfileLoading(null); setListOpen(false); trackAnalytics('runner_profile_opened', {}); }
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
  const toggleRace = (race: RunnerRace) => {
    setSelected(previous => previous.some(row => row.id === race.id) ? previous.filter(row => row.id !== race.id) : [...previous, race]);
    setConfirmed(null); setEditing(false);
  };
  const visibleMatches = runnerSearchPage(matches, page);
  // Only with matches: the empty page renders no number (a throwing toLocaleString must fail the results, not hydration).
  const groupsFound = matches.length ? `${count(matches.length)} matching ${matches.length === 1 ? 'record group' : 'record groups'}` : '';
  const pages = Math.ceil(matches.length / RUNNER_PAGE_SIZE);
  const orderedRaces = useMemo(() => profile && manifest ? [...profile.races].sort((a, b) => manifest.editions[b.edition].year - manifest.editions[a.edition].year || a.id - b.id) : [], [profile, manifest]);
  // The records the open profile lists, each with its tag and (when limited) its checkpoints.
  const listed = useMemo(() => new Set(orderedRaces.map(race => race.id)), [orderedRaces]);
  const busy = searchLoading || waiting !== null;
  // A search that finds no name sets the earlier selection and its analysis aside (kept in state), so neither reads as
  // that search's result or covers its next steps; the next search that finds a name brings the selection bar back.
  const noMatch = !!manifest && !!searched && !searchLoading && !searchError && !matches.length;

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
    }}><label htmlFor="runner-name" className="runner-search-label">Recorded name</label><div className="runner-search-fields"><input id="runner-name" className="input" type="search" enterKeyHint="search" autoComplete="name" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="First or last name" aria-describedby="runner-name-help" /><button className="btn btn-secondary runner-search-go" type="submit" aria-busy={busy || undefined}>{busy ? 'Searching…' : 'Find races'}</button></div><p id="runner-name-help" className="runner-note">Any order, with or without accents; three letters are enough.</p></form>
    {waiting !== null && <p className="runner-note runner-status" role="status">Finding matching names…</p>}
    {manifestError && <div className="runner-error" role="alert"><p>{manifestError}</p><button type="button" className="btn btn-secondary is-compact" onClick={() => setManifestRetry(value => value + 1)}>Try again</button></div>}
    {searchError && <div className="runner-error" role="alert"><p>{searchError}</p>{searched && <button type="button" className="btn btn-secondary is-compact" onClick={() => manifest && void runSearch(searched, manifest)}>Try again</button>}</div>}
    {searchLoading && <p className="runner-note runner-status" role="status">Finding matching names…</p>}
    </div>
    <div className="runner-main">
    {!searched && starts}
    {manifest && searched && !searchLoading && !searchError && <section className="runner-results ph-no-capture" aria-labelledby="runner-results-title">{profile && !listOpen && matches.length > 0
      ? <p className="runner-results-row"><span id="runner-results-title"><b>{searched}</b> · {groupsFound}</span><button type="button" className="btn btn-tertiary" onClick={() => setListOpen(true)}>Change</button></p>
      : <>
      <h2 id="runner-results-title" className="runner-h"><span role="status">{matches.length ? groupsFound : 'No matching recorded name'}</span></h2>
      <p className="runner-note">{matches.length ? `For “${searched}”. People can share a name: check the races before combining them.` : 'Try the spelling on the original result, a surname, or fewer name parts.'}</p>
      {!matches.length && <NoMatchNext manifest={manifest} />}
      {matches.length > NARROW_ABOVE && <p className="runner-note runner-narrow">Add a first name to narrow them.</p>}
      {/* Each row as a runner recognizes a race: one race by its city and year ("Washington 2014"), several by their
          count and span ("3 races · 2011–2025"). */}
      {matches.length > 0 && <ul className="runner-matches">{visibleMatches.map(row => <li key={row[1]}><button className="runner-match" type="button" aria-expanded={profile?.id === row[1]} aria-controls="runner-profile" onClick={() => void openProfile(row[1])}><span><strong>{shownName(row[0])}</strong><small>{row[2] === 1 ? `${row[5]} ${row[3]}` : `${count(row[2])} races · ${row[3] === row[4] ? row[3] : `${row[3]}–${row[4]}`}`}</small></span><span className="runner-match-action">{profileLoading === row[1] ? 'Loading…' : <span className="sr-only">See races</span>}<Arrow /></span></button></li>)}</ul>}
      {pages > 1 && <nav className="runner-pagination" aria-label="Search result pages"><button type="button" className="btn btn-secondary is-compact" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>{count(page * RUNNER_PAGE_SIZE + 1)}–{count(Math.min(matches.length, (page + 1) * RUNNER_PAGE_SIZE))} of {count(matches.length)}</span><button type="button" className="btn btn-secondary is-compact" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
    </>}</section>}
    {profileError && <div className="runner-error" role="alert"><p>{profileError} Select the match again to retry.</p></div>}
    <div id="runner-profile" className="ph-no-capture">{manifest && profile && <section className="runner-profile" aria-labelledby="runner-profile-title"><h2 id="runner-profile-title" className="runner-h" tabIndex={-1} ref={profileHeading}>{[...new Set(profile.names.filter(Boolean).map(displayName))].join(' / ') || 'Recorded race group'}</h2><p className="runner-note">Tick only the races you recognize. You can add races from other matches too.</p>
      <ul className="runner-races">{orderedRaces.map(race => <li className="runner-race" key={race.id}><label className="runner-race-row"><input type="checkbox" checked={selected.some(row => row.id === race.id)} onChange={() => toggleRace(race)} /><span className="runner-race-body"><RunnerRecordDetails race={race} manifest={manifest} copyEditions={copyEditions} /></span></label>
        {!analysed(race, manifest, copyEditions) && <RecordedCheckpoints race={race} manifest={manifest} copyEditions={copyEditions} />}
      </li>)}</ul>
    </section>}</div>
    {searched && matches.length > 0 && !searchLoading && !searchError && !selected.length && !confirmed && starts}
    {manifest && selected.length > 0 && !noMatch && (confirmed && !editing
      ? <section className="runner-selection is-quiet ph-no-capture" aria-labelledby="runner-selection-title"><p className="runner-selection-row"><span id="runner-selection-title">{count(selected.length)} {selected.length === 1 ? 'race' : 'races'} selected</span><button type="button" className="btn btn-tertiary runner-edit" aria-expanded={false} onClick={() => setEditing(true)}>Edit</button></p></section>
      : <section className="runner-selection ph-no-capture" aria-labelledby="runner-selection-title"><h2 id="runner-selection-title" className="sr-only">{count(selected.length)} {selected.length === 1 ? 'race' : 'races'} selected</h2><ul className="runner-chips">{selected.map(race => <li key={race.id}><span>{raceLabel(race, manifest)} · {finishLabel(race)}{!race.eligible && <small> · limited</small>}</span><button type="button" onClick={() => toggleRace(race)} aria-label={`Remove ${race.name}, ${raceLabel(race, manifest)}, record ${race.id}`}><span aria-hidden="true" className="runner-chip-x" /></button></li>)}</ul><div className="runner-selection-actions">{confirmed
        ? <button className="btn btn-tertiary runner-done" type="button" aria-expanded={true} onClick={() => setEditing(false)}>Done</button>
        : <button className="btn btn-primary is-compact button-primary" type="button" onClick={() => { trackAnalytics('race_comparison_opened', { selection: selected.length === 1 ? 'one' : 'multiple', availability: selected.every(race => analysed(race, manifest, copyEditions)) ? 'eligible' : selected.some(race => analysed(race, manifest, copyEditions)) ? 'mixed' : 'limited' }); setConfirmed([...selected]); setEditing(false); requestAnimationFrame(() => analysisRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })); }}>{selected.length === 1 ? 'View the selected race' : `View ${count(selected.length)} selected races`}<Arrow /></button>}<button className="btn btn-tertiary runner-clear" type="button" onClick={() => { setSelected([]); setConfirmed(null); setEditing(false); }}>Clear</button></div></section>)}
    </div>
    </div>
    {/* The analysis reads under the search and what it found, outside their column (from 900 px it is wider, on the
        same axis). */}
    <div ref={analysisRef} className="runner-reading ph-no-capture">{confirmed && manifest && !noMatch && <SelectedAnalysis races={confirmed} manifest={manifest} units={units} copyEditions={copyEditions} report={report} listed={listed} wet={wet} />}</div>
  </>;
}
