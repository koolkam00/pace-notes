'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { TierLine } from '@/components/ui/TierTag';
import { dataFetch } from '@/lib/data-fetch';
import { loadErrorText } from '@/lib/error-text';
import { raceDisplayName, type DirectoryRace, type RaceDirectory } from '@/lib/races-types';

/**
 * Every marathon on /courses, on demand: the list is one file of several hundred races (public/data/races/directory.json),
 * so the page's first load holds none of its rows; this island fetches it when the list nears the screen or the filter
 * takes focus (no referrer; the bytes checked against the digest the build recorded). A row is the race's name (its label
 * where the platform's title misleads: docs/RACES.md rule 6), its place, its years, its editions and recorded results
 * and its tier line (lib/tiers.ts `tierLine`); a race with a page is a link, any other plain text. Alphabetical, never by
 * tier (an order by tier would read as a ranking).
 *
 * The filter is typed text (AGENTS.md rule 18): it goes into no URL, no analytics event and no request, and the whole
 * island carries `ph-no-capture`, so a session recording holds neither the box nor the rows it leaves (which would
 * spell out what was typed). It matches the name, label, place and the reviewed search aliases (Milan for Milano),
 * accents and case aside, and never shows an alias.
 */

const STEP = 50;
/** Accents, case and punctuation aside (the directory's search folds accents itself: docs/RACES.md rule 7). */
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
const whole = new Intl.NumberFormat('en-US');

async function digest(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let pending: Promise<RaceDirectory> | null = null;
function loadDirectory(sha256: string): Promise<RaceDirectory> {
  if (!pending) {
    pending = (async () => {
      const response = await dataFetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/races/directory.json?v=' + sha256, { referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('This list could not be loaded. Check the connection and try again.');
      const buffer = await response.arrayBuffer();
      if (typeof crypto !== 'undefined' && crypto.subtle && (await digest(buffer)) !== sha256) throw new Error('This list did not match the published file, so it is not shown.');
      return JSON.parse(new TextDecoder().decode(buffer)) as RaceDirectory;
    })();
    pending.catch(() => { pending = null; });
  }
  return pending;
}

/** Two races under one label (Warsaw), by name and years, as its page names them (review m5, November 20, 2026). */
export type RaceSeriesNames = Record<string, { name: string; years: string }[]>;

function RaceRow({ race, codes, series }: { race: DirectoryRace; codes: RaceDirectory['codes']; series?: RaceSeriesNames[string] }) {
  const name = series && series.length > 1 ? series.map((s) => s.name).join(' and ') : raceDisplayName(race);
  const live = race.editions.filter((e) => codes.review[e[8]] !== 'copy').length;
  const years = series && series.length > 1 ? series.map((s) => s.years).join(' and ') : race.years[0] === race.years[1] ? String(race.years[0]) : `${race.years[0]}–${race.years[1]}`;
  const place = race.place && race.place !== name ? race.place : null;
  return (
    <li className="race-row">
      {race.slug ? <Link href={`/courses/${race.slug}`} className="race-row-name">{name}</Link> : <span className="race-row-name">{name}</span>}
      <span className="race-row-meta">
        {place ? <>{place}{' · '}</> : null}{years}{' · '}{live === 1 ? '1 edition' : `${whole.format(live)} editions`}{' · '}{race.results === 1 ? '1 result' : `${whole.format(race.results)} results`}
      </span>
      <TierLine className="race-row-tiers" counts={race.tiers} format={(n) => whole.format(n)} />
    </li>
  );
}

export default function RaceFinder({ sha, total, series = {} }: { sha: string; total: string; series?: RaceSeriesNames }) {
  const [directory, setDirectory] = useState<RaceDirectory | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(STEP);
  const root = useRef<HTMLDivElement>(null);

  const open = () => {
    if (directory || state === 'loading') return;
    setState('loading');
    loadDirectory(sha)
      .then((d) => { setDirectory(d); setState('idle'); })
      .catch((error: unknown) => { setMessage(loadErrorText(error, 'This list could not be loaded.')); setState('error'); });
  };

  // Load when the list comes near the screen: a visitor scrolling to it finds it there.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const watch = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { watch.disconnect(); open(); } }, { rootMargin: '600px 0px' });
    watch.observe(el);
    return () => watch.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => (directory ? [...directory.races].sort((a, b) => fold(raceDisplayName(a)).localeCompare(fold(raceDisplayName(b))) || a.label.localeCompare(b.label)) : []), [directory]);
  const index = useMemo(() => sorted.map((race) => fold([raceDisplayName(race), race.label, race.place ?? '', ...(race.aliases ?? []), ...(series[race.label] ?? []).map((s) => s.name)].join(' '))), [sorted, series]);
  const wanted = fold(query);
  const matches = useMemo(() => sorted.filter((_, i) => !wanted || index[i].includes(wanted)), [sorted, index, wanted]);
  const shown = matches.slice(0, limit);

  return (
    <div className="race-finder ph-no-capture" ref={root}>
      <div className="field race-finder-field">
        <label className="field-label" htmlFor="race-find">Find a marathon</label>
        <input id="race-find" className="input" type="search" autoComplete="off" spellCheck={false} maxLength={80} value={query} placeholder="Name or place"
          onFocus={open} onChange={(event) => { setQuery(event.target.value); setLimit(STEP); }} />
      </div>
      {!directory ? (
        state === 'error'
          ? <p className="field-error" role="alert">{message} <button type="button" className="btn btn-tertiary is-compact" onClick={() => { setState('idle'); open(); }}>Try again</button></p>
          : <p className="field-hint">{state === 'loading' ? 'Loading the list…' : <button type="button" className="btn btn-secondary is-compact" onClick={open}>Show all {total} marathons</button>}</p>
      ) : (
        <>
          <p className="field-hint race-finder-count" role="status">{matches.length === 0 ? 'No marathon matches.' : matches.length === 1 ? '1 marathon' : `${whole.format(matches.length)} marathons`}{matches.length > shown.length ? `, the first ${whole.format(shown.length)} shown` : ''}</p>
          {shown.length ? <ol className="race-rows">{shown.map((race) => <RaceRow key={race.label} race={race} codes={directory.codes} series={series[race.label]} />)}</ol> : null}
          {matches.length > shown.length ? <button type="button" className="btn btn-secondary is-compact race-finder-more" onClick={() => setLimit(limit + STEP * 4)}>Show more</button> : null}
        </>
      )}
    </div>
  );
}
