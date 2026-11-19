'use client';

import { useMemo, useState } from 'react';
import { loadHalf } from '@/lib/half';
import { loadErrorText } from '@/lib/error-text';
import type { HalfRaceDirectory } from '@/lib/half-types';
import { RaceFold } from './HalfRaceRows';

/**
 * Every half race, on demand (/half/races): the list is one file of several thousand races, so the page's first load
 * holds only the races listed in full and this island fetches the rest when the visitor asks (lib/half.ts loadHalf: no
 * referrer, the bytes checked against the digest the build recorded). What the visitor types to find a race stays in
 * this component: it goes into no URL, no analytics event and no request (AGENTS.md rule 18). The whole island, the box
 * and the rows it leaves (which would spell out what was typed), carries `ph-no-capture`, so a session recording holds
 * neither (November 19, 2026, as the course list's finder does).
 */

const STEP = 40;
/** Accents, case and punctuation aside. */
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function HalfRacesAll({ sha, total }: { sha: string; total: string }) {
  const [directory, setDirectory] = useState<HalfRaceDirectory | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(STEP);

  const open = () => {
    setState('loading');
    loadHalf<HalfRaceDirectory>('half/races/directory.json', sha)
      .then((d) => { setDirectory(d); setState('idle'); })
      .catch((error: unknown) => { setMessage(loadErrorText(error, 'This data could not be loaded.')); setState('error'); });
  };

  const index = useMemo(() => (directory ? directory.races.map((race) => fold([race.name, race.place ?? '', ...(race.aliases ?? [])].join(' '))) : []), [directory]);
  const wanted = fold(query);
  const matches = useMemo(() => (directory ? directory.races.filter((_, i) => !wanted || index[i].includes(wanted)) : []), [directory, index, wanted]);

  if (!directory) {
    return (
      <div className="half-races-all ph-no-capture">
        <button type="button" className="btn btn-secondary is-compact" onClick={open} disabled={state === 'loading'}>{state === 'loading' ? 'Loading the list…' : `Show all ${total} races`}</button>
        {state === 'error' ? <p className="field-error" role="alert">{message}</p> : null}
      </div>
    );
  }
  const shown = matches.slice(0, limit);
  return (
    <div className="half-races-all ph-no-capture">
      <div className="field">
        <label className="field-label" htmlFor="half-race-find">Find a race</label>
        <input id="half-race-find" className="input" type="search" autoComplete="off" maxLength={80} value={query}
          onChange={(event) => { setQuery(event.target.value); setLimit(STEP); }} />
      </div>
      <p className="field-hint" role="status">{matches.length === 1 ? '1 race' : `${matches.length.toLocaleString('en-US')} races`}{matches.length > shown.length ? `, the first ${shown.length} shown` : ''}</p>
      {shown.map((race) => <RaceFold key={race.label} race={race} codes={directory.codes} />)}
      {matches.length > shown.length ? <button type="button" className="btn btn-secondary is-compact" onClick={() => setLimit(limit + STEP)}>Show more</button> : null}
    </div>
  );
}
