'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { distanceLabel, paceLabel, type UnitSystem } from '@/lib/units';
import RunnerContext from './RunnerContext';
import { sourceLabel, sourceReleaseHref } from '@/lib/data-source';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';
import {
  loadRunnerManifest, loadRunnerProfile, normalizeRunnerName, runnerDuration, runnerProgression, runnerSearchPage, searchRunnerNames, RUNNER_PAGE_SIZE,
  type RunnerManifest, type RunnerMatch, type RunnerProfile, type RunnerRace,
} from '@/lib/runner-search';

const count = (value: number) => value.toLocaleString('en-US');
const raceLabel = (race: RunnerRace, manifest: RunnerManifest) => {
  const edition = manifest.editions[race.edition];
  return `${edition.city === 'New York' ? 'New York City' : edition.city} ${edition.year}`;
};
const percent = (value: number) => Math.abs(value).toFixed(1) + '%';
const changeDescription = (value: number) => Math.abs(value) < 0.05 ? 'the same pace' : `${percent(value)} ${value > 0 ? 'slower' : 'faster'}`;
const finishLabel = (race: RunnerRace) => race.raw_times?.[8] || runnerDuration(race.times[8]);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The records could not load. Please try again.';
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

export function RunnerRecordDetails({ race, manifest }: { race: RunnerRace; manifest: RunnerManifest }) {
  return <><strong>{raceLabel(race, manifest)}</strong><span className="runner-race-name">{race.name || 'Name not recorded'}</span><small>{manifest.editions[race.edition].race} · {race.age === null ? 'Age not recorded' : `Recorded age ${race.age}${race.age < 18 || race.age > 89 ? ' (outside the usable age range)' : ''}`} · {race.sex ? `Recorded gender ${race.sex}` : 'Gender not recorded'}</small><span className="runner-recorded-finish">Recorded finish: {finishLabel(race)}</span><span className={race.eligible ? 'runner-eligible' : 'runner-ineligible'}>{race.eligible ? 'Pacing analysis available' : 'Recorded result · limited analysis'}</span>{!race.eligible && <small>{race.reason || 'The timings or edition need further verification.'} Pacing and peer comparisons are unavailable for this record.</small>}</>;
}

function RecordedCheckpoints({ race, manifest, units }: { race: RunnerRace; manifest: RunnerManifest; units: UnitSystem }) {
  return <details className="runner-raw"><summary>See original recorded checkpoints</summary><div className="runner-table-wrap"><table><caption className="sr-only">Original source readings for record {race.id}</caption><thead><tr><th scope="col">Checkpoint</th><th scope="col">Recorded elapsed time</th></tr></thead><tbody>{manifest.points_km.map((end, i) => <tr key={end}><th scope="row">{distanceLabel(end, units)}</th><td>{race.raw_times?.[i] || runnerDuration(race.times[i])}</td></tr>)}</tbody></table></div><p className="control-help">Record {race.id}. These are the original source readings; missing or inconsistent timings are not filled in or used to calculate pace.</p></details>;
}

function LimitedRecords({ races, manifest, units }: { races: RunnerRace[]; manifest: RunnerManifest; units: UnitSystem }) {
  return <ul className="runner-races runner-limited-records">{races.map(race => <li className="runner-race" key={race.id}><RunnerRecordDetails race={race} manifest={manifest} /><RecordedCheckpoints race={race} manifest={manifest} units={units} /></li>)}</ul>;
}

export function RunnerSearchCoverage({ manifest }: { manifest: RunnerManifest }) {
  return <p className="control-help runner-search-coverage"><strong>Search all {count(manifest.named_records)} named race records.</strong> Incomplete results and editions awaiting review are included. You can view a recorded result even when pacing analysis is unavailable.</p>;
}

export function SelectedAnalysis({ races, manifest, units }: { races: RunnerRace[]; manifest: RunnerManifest; units: UnitSystem }) {
  const progression = useMemo(() => runnerProgression(races, manifest), [races, manifest]);
  const valid = progression?.valid || [];
  const limited = races.filter(race => !race.eligible);
  if (!progression) return <section className="runner-analysis" aria-labelledby="runner-analysis-title">
    <header className="analysis-finding"><p className="eyebrow">Your selected records</p><h2 id="runner-analysis-title">Your race records are here.</h2>
      <p>You can view the recorded names, races, finish times and available checkpoints below. These records need more complete or verified data before they can support pacing or peer comparisons. Each race explains what is missing or awaiting review.</p></header>
    <LimitedRecords races={races} manifest={manifest} units={units} />
  </section>;
  const { best, earliestYear, latestYear, yearChange } = progression;
  return <section className="runner-analysis" aria-labelledby="runner-analysis-title">
    <header className="analysis-finding"><p className="eyebrow">The races you selected</p><h2 id="runner-analysis-title">{valid.length === 1 ? 'One race. A closer look.' : `${count(valid.length)} races. Your recorded progression.`}</h2>
      <p>{races.length === valid.length ? 'Every selected race passes the timing and edition checks.' : `${count(limited.length)} selected ${limited.length === 1 ? 'record has' : 'records have'} limited analysis and can be viewed below. Pacing comparisons use the ${count(valid.length)} eligible ${valid.length === 1 ? 'result' : 'results'} only.`} These results describe your selection and do not verify who ran each race.</p>
    </header>
    <div className="runner-numbers"><div><strong>{runnerDuration(best.metrics.finish)}</strong><span>Fastest selected eligible finish</span><small>{raceLabel(best.race, manifest)}</small></div><div><strong>{paceLabel(best.metrics.pace, units)}</strong><span>Average pace in that race</span><small>Full {distanceLabel(42.195, units)}</small></div><div><strong>{count(valid.length)}</strong><span>Eligible selected {valid.length === 1 ? 'finish' : 'finishes'}</span><small>{earliestYear === latestYear ? earliestYear : `${earliestYear}–${latestYear}`}</small></div></div>
    {yearChange !== null && <p className="runner-takeaway">Your fastest selected finish in {latestYear} was {Math.abs(yearChange) < 0.0005 ? 'the same time as' : `${runnerDuration(Math.abs(yearChange))} ${yearChange > 0 ? 'faster' : 'slower'} than`} your fastest selected finish in {earliestYear}. Courses, weather and other conditions may differ.</p>}
    <div className="runner-table-wrap"><table><caption>All eligible races you selected</caption><thead><tr><th scope="col">Race</th><th scope="col">Finish</th><th scope="col">Average pace</th><th scope="col">Late vs early pace</th></tr></thead><tbody>
      {valid.map(({ race, metrics }) => <tr key={race.id}><th scope="row">{raceLabel(race, manifest)}</th><td>{runnerDuration(metrics.finish)}</td><td>{paceLabel(metrics.pace, units)}</td><td>{changeDescription(metrics.lateChange)}</td></tr>)}
    </tbody></table></div>
    {limited.length > 0 && <section className="runner-limited" aria-labelledby="runner-limited-title"><h3 id="runner-limited-title">Your other selected race records</h3><p className="control-help">These results remain available to view. Their timings do not contribute to the fastest finish, pacing or peer comparisons.</p><LimitedRecords races={limited} manifest={manifest} units={units} /></section>}
    <RunnerContext races={races} manifest={manifest} units={units} />
  </section>;
}

export default function RunnerSearch() {
  const { units } = useUnits();
  const [manifest, setManifest] = useState<RunnerManifest | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [manifestRetry, setManifestRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [matches, setMatches] = useState<RunnerMatch[]>([]);
  const [page, setPage] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [profile, setProfile] = useState<RunnerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<number | null>(null);
  const [profileError, setProfileError] = useState('');
  const [selected, setSelected] = useState<RunnerRace[]>([]);
  const [confirmed, setConfirmed] = useState<RunnerRace[] | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const profileController = useRef<AbortController | null>(null);
  const profileHeading = useRef<HTMLHeadingElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (value: string, source: RunnerManifest) => {
    searchController.current?.abort(); profileController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setProfile(null); setProfileLoading(null); setProfileError(''); setMatches([]); setPage(0); setSearchError('');
    if (!normalizeRunnerName(value)) { setSearched(''); setSearchError('Enter a recorded name or the beginning of a name.'); setSearchLoading(false); return; }
    setSearched(value.trim()); setSearchLoading(true);
    trackAnalytics('runner_search_submitted', {});
    try {
      const results = await searchRunnerNames(value, source, controller.signal);
      if (!controller.signal.aborted) { setMatches(results); setSearchLoading(false); trackAnalytics('runner_search_completed', { outcome: results.length ? 'matches' : 'no_matches' }); }
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
    }).catch(error => { if (!controller.signal.aborted) setManifestError(errorMessage(error)); });
    return () => { controller.abort(); searchController.current?.abort(); profileController.current?.abort(); };
  }, [manifestRetry, runSearch]);
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
      if (!controller.signal.aborted) { setProfile(value); setProfileLoading(null); trackAnalytics('runner_profile_opened', {}); }
    } catch (error) { if (!controller.signal.aborted) { setProfileError(errorMessage(error)); setProfileLoading(null); } }
  };
  useEffect(() => { if (profile) profileHeading.current?.focus({ preventScroll: false }); }, [profile]);
  const toggleRace = (race: RunnerRace) => {
    setSelected(previous => previous.some(row => row.id === race.id) ? previous.filter(row => row.id !== race.id) : [...previous, race]);
    setConfirmed(null);
  };
  const visibleMatches = runnerSearchPage(matches, page);
  const pages = Math.ceil(matches.length / RUNNER_PAGE_SIZE);
  const orderedRaces = useMemo(() => profile && manifest ? [...profile.races].sort((a, b) => manifest.editions[b.edition].year - manifest.editions[a.edition].year || a.id - b.id) : [], [profile, manifest]);

  return <article className="runner-page">
    <header className="directory-heading"><p className="eyebrow">Every recorded runner</p><h1>Find your name.<br /><span>Explore your races.</span></h1><p>Search every named result in the database, including races with incomplete data. Choose the races that belong to you, see what was recorded, and explore pacing and comparisons where the data supports them.</p></header>
    {manifest && <RunnerSearchCoverage manifest={manifest} />}
    <form className="comparison-controls runner-search-form" role="search" onSubmit={event => {
      event.preventDefault(); if (!manifest) return;
      // The name stays in this history entry, never in the address (see savedRunnerQuery). Repeating a search adds no entry.
      const value = query.trim().slice(0, MAX_QUERY);
      const address = new URL(window.location.href); address.searchParams.delete('q');
      const href = unitHref(address.pathname + address.search + address.hash, units);
      const state: unknown = window.history.state;
      if (state && typeof state === 'object' && (state as { runnerQuery?: unknown }).runnerQuery === value) window.history.replaceState({ runnerQuery: value }, '', href);
      else window.history.pushState({ runnerQuery: value }, '', href);
      void runSearch(query, manifest);
    }}><label htmlFor="runner-name">Recorded name</label><div className="runner-search-fields"><input id="runner-name" type="search" autoComplete="name" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="First name, last name, or both" aria-describedby="runner-name-help" /><button className="button-primary" type="submit" disabled={!manifest || searchLoading}>{searchLoading ? 'Searching…' : 'Find races'}</button></div><p id="runner-name-help" className="control-help">Name order and accents do not matter. You can use the beginning of a name with at least three letters; shorter parts must match a whole recorded name part.</p></form>
    {!manifest && !manifestError && <p className="loading-message" role="status">Loading search information…</p>}
    {manifestError && <div className="feedback-error" role="alert"><p>{manifestError}</p><button type="button" onClick={() => setManifestRetry(value => value + 1)}>Try again</button></div>}
    {searchError && <div className="feedback-error" role="alert"><p>{searchError}</p>{searched && <button type="button" onClick={() => manifest && void runSearch(searched, manifest)}>Try again</button>}</div>}
    {searchLoading && <p className="loading-message" role="status">Finding matching names…</p>}
    {manifest && searched && !searchLoading && !searchError && <section className="runner-results" aria-labelledby="runner-results-title">
      <h2 id="runner-results-title" role="status">{matches.length ? `${count(matches.length)} matching ${matches.length === 1 ? 'record group' : 'record groups'}` : 'No matching recorded name'}</h2>
      <p className="control-help">{matches.length ? `Results for “${searched}”. People can share a name, and one person can appear in separate groups. Open a match and check the races before combining them.` : 'Try the spelling on the original result, a surname, or fewer name parts. Missing splits do not hide a name from search. A result may be absent from the database or have an unusable recorded name.'}</p>
      {matches.length > 0 && <ul className="runner-matches">{visibleMatches.map(row => <li key={row[1]}><button className="runner-match" type="button" aria-expanded={profile?.id === row[1]} aria-controls="runner-profile" onClick={() => void openProfile(row[1])}><span><strong>{row[0]}</strong><small>{count(row[2])} {row[2] === 1 ? 'race' : 'races'} · {row[3] === row[4] ? row[3] : `${row[3]}–${row[4]}`} · {row[2] > 1 ? 'Including ' : ''}{row[5]}</small></span><span className="runner-match-action">{profileLoading === row[1] ? 'Loading…' : 'See races'} <span aria-hidden="true">→</span></span></button></li>)}</ul>}
      {pages > 1 && <nav className="runner-pagination" aria-label="Search result pages"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {count(page + 1)} of {count(pages)} · {count(page * RUNNER_PAGE_SIZE + 1)}–{count(Math.min(matches.length, (page + 1) * RUNNER_PAGE_SIZE))} of {count(matches.length)}</span><button type="button" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
    </section>}
    {profileError && <div className="feedback-error" role="alert">{profileError} Select the match again to retry.</div>}
    <div id="runner-profile">{manifest && profile && <section className="runner-profile" aria-labelledby="runner-profile-title"><h2 id="runner-profile-title" tabIndex={-1} ref={profileHeading}>{profile.names.filter(Boolean).join(' / ') || 'Recorded race group'}</h2><p className="control-help">Choose only the races you recognize. The database suggests this grouping; it is not proof that these records belong to one person. You can add races from other search matches to the same selection.</p>
      <ul className="runner-races">{orderedRaces.map(race => <li className="runner-race" key={race.id}><label><input type="checkbox" checked={selected.some(row => row.id === race.id)} onChange={() => toggleRace(race)} /><span><RunnerRecordDetails race={race} manifest={manifest} /></span></label>
        {!race.eligible && <RecordedCheckpoints race={race} manifest={manifest} units={units} />}
      </li>)}</ul>
    </section>}</div>
    {manifest && selected.length > 0 && <section className="runner-selection" aria-labelledby="runner-selection-title"><h2 id="runner-selection-title">{count(selected.length)} {selected.length === 1 ? 'race' : 'races'} selected</h2><p className="control-help">Choose only the races you recognize. View them together, with pacing and comparisons available for results that pass the timing and edition checks.</p><ul>{selected.map(race => <li key={race.id}><span>{race.name || 'Name not recorded'} · {raceLabel(race, manifest)} · {finishLabel(race)}{!race.eligible && <small>Recorded result · limited analysis</small>}</span><button type="button" onClick={() => toggleRace(race)} aria-label={`Remove ${race.name}, ${raceLabel(race, manifest)}, record ${race.id}`}>Remove</button></li>)}</ul><div className="runner-selection-actions"><button className="button-primary" type="button" onClick={() => { trackAnalytics('race_comparison_opened', { selection: selected.length === 1 ? 'one' : 'multiple', availability: selected.every(race => race.eligible) ? 'eligible' : selected.some(race => race.eligible) ? 'mixed' : 'limited' }); setConfirmed([...selected]); requestAnimationFrame(() => analysisRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })); }}>View selected races <span aria-hidden="true">→</span></button><button className="button-secondary" type="button" onClick={() => { setSelected([]); setConfirmed(null); }}>Clear selection</button></div></section>}
    <div ref={analysisRef}>{confirmed && manifest && <SelectedAnalysis races={confirmed} manifest={manifest} units={units} />}</div>
    {manifest && <footer className="runner-source"><p>{count(manifest.named_records)} race records have searchable names, out of {count(manifest.raw_records)} records in the database. These are finishes and source records, not a count of unique people.{manifest.raw_records > manifest.named_records && <> The remaining {count(manifest.raw_records - manifest.named_records)} records have no usable name for lookup; they are retained in the complete data download.</>}</p><p>Source: <a href={sourceReleaseHref(manifest.release_tag)}>{sourceLabel(manifest.input_as_of, manifest.release_tag)}</a>. <a href={sourceReleaseHref(manifest.release_tag)}>Download the complete data</a>. <Link href="/about#data-coverage">Marathons, years and recorded fields</Link>.</p><details><summary>How search and analysis work</summary><p>Search matches the recorded name parts after normalizing accents, punctuation and letter case. Suggested groups use the database’s candidate links with consistency checks. Shared names, changed names and incomplete source fields can leave false or separate matches, so you choose the records explicitly.</p><p>All named results can appear, including records with missing timings or excluded editions. Pacing calculations use only selected results that pass the same timing and source-quality checks as the study. Finish-time comparisons are descriptive: they do not adjust for weather, terrain or fitness, and they are not predictions.</p><p>Races are ordered by recorded year. Races in the same year are not assumed to be in chronological order. A fastest selected time is not necessarily a lifetime personal best.</p></details></footer>}
  </article>;
}
