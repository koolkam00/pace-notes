import type { ReactNode } from 'react';
import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { POSSIBLE_MATCH, inline, possibleMatchCount } from '@/lib/tiers';
import { displayName, type RunnerManifest, type RunnerMatch, type RunnerSearchResult } from '@/lib/runner-search';
import { distanceWords, editionLabel } from './records';

// What a name search lists on /runners (lookup version 2, split out of components/RunnerSearch.tsx): one row per
// profile and recorded spelling, and the states of a search that cannot list everything at once. A search runs on whole
// words first; names that start with the typed words are listed when nothing matches or on a press; a step past
// 300 KB waits for a press that says its size, and nothing past 1 MB is ever loaded.

const count = (value: number) => value.toLocaleString('en-US');
/** A download's size as a visitor reads it: "74 KB", "0.4 MB" (1 KB is 1,000 bytes). */
export const sizeLabel = (bytes: number): string => bytes < 995000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1e6).toFixed(1)} MB`;
/** A row's identity on the page: its profile and its spelling. */
export const matchKey = (row: RunnerMatch): string => `${row.shard}:${row.position}:${row.name}`;
/** A row's name, its country code quiet after it ("Brian Suozzo · USA"). */
export const shownName = (name: string): ReactNode => { const [person, country] = displayName(name).split(' · '); return country ? <>{person}<span className="runner-country"> · {country}</span></> : person; };
const span = (row: RunnerMatch) => row.firstYear === row.lastYear ? String(row.firstYear) : `${row.firstYear}–${row.lastYear}`;

/**
 * A row as a runner recognizes it. One result reads as its race and distance ("Chicago 2019 · marathon"); several read
 * by their counts, each distance on its own, and their span ("3 marathons · 2 half marathons · 2011–2025"), with the
 * possible matches counted apart. A spelling that occurs only on possible matches says so, and a group with no result
 * of its own is "results that may belong together": a possible match is never presented as the runner's.
 */
export function matchLine(row: RunnerMatch, manifest: Pick<RunnerManifest, 'editions'>): string {
  if (row.edition !== null) {
    const edition = manifest.editions[row.edition];
    return `${editionLabel(edition)} · ${distanceWords(edition.distance)}${row.onlyPossible ? ` · ${inline(POSSIBLE_MATCH)}` : ''}`;
  }
  if (row.onlyPossible) return `${possibleMatchCount(row.possible, count)} · ${span(row)}`;
  if (row.marathons + row.halves === 0) return `${count(row.possible)} results that may belong together · ${span(row)}`;
  return [row.marathons ? `${count(row.marathons)} ${distanceWords('marathon', row.marathons)}` : null, row.halves ? `${count(row.halves)} ${distanceWords('half', row.halves)}` : null,
    span(row), row.possible ? possibleMatchCount(row.possible, count) : null].filter(Boolean).join(' · ');
}

/** The rows of one page of results. */
export function MatchRows({ rows, manifest, openKey, loadingKey, onOpen }: { rows: RunnerMatch[]; manifest: Pick<RunnerManifest, 'editions'>; openKey: string | null; loadingKey: string | null; onOpen: (row: RunnerMatch) => void }) {
  return <ul className="runner-matches">{rows.map(row => {
    const key = matchKey(row);
    return <li key={key}><button className="runner-match" type="button" aria-expanded={openKey === key} aria-controls="runner-profile" onClick={() => onOpen(row)}><span><strong>{shownName(row.name)}</strong><small>{matchLine(row, manifest)}</small></span><span className="runner-match-action">{loadingKey === key ? 'Loading…' : <span className="sr-only">See races</span>}<Arrow /></span></button></li>;
  })}</ul>;
}

/**
 * What a search could not list by itself, in one message with, where a press may load it, the button that says how
 * much: one very common word typed alone (its count and a request for a second word), names that start with the typed
 * words, and a search too large to load at all.
 */
export function SearchMore({ result, searched, busy, onMore }: { result: RunnerSearchResult; searched: string; busy: boolean; onMore: (step: 'whole' | 'beginnings') => void }) {
  const { matches, alone, more, capped } = result;
  const button = (label: string) => more ? <button type="button" className="btn btn-secondary is-compact runner-more-go" aria-busy={busy || undefined} onClick={() => onMore(more.step)}>{busy ? 'Loading…' : `${label}${more.bytes > 0 ? ` (${sizeLabel(more.bytes)})` : ''}`}</button> : null;
  return <>
    {alone ? <p className="runner-note runner-narrow">{count(alone.names)} recorded names include “{searched.trim()}”. {matches.length ? 'These are the ones recorded under that one word. ' : ''}Add a first name or a surname.</p> : null}
    {more?.step === 'whole' ? <div className="runner-more"><p className="runner-note">Listing these names is a larger download.</p>{button('List them')}</div> : null}
    {more?.step === 'beginnings' ? <div className="runner-more">{matches.length ? null : <p className="runner-note">{alone ? 'Names that start with these letters can be listed too.' : 'No recorded name has exactly these words. Names that start with them can be listed.'}</p>}{button('Show names that start with these words')}</div> : null}
    {capped === 'whole' ? <p className="runner-note runner-narrow">Too many recorded names match to list. Add another name.</p> : null}
    {capped === 'beginnings' && !matches.length ? <p className="runner-note runner-narrow">Too many recorded names start with these letters to list. Type more of the name.</p> : null}
  </>;
}

/**
 * After a search finds no name: three ways on that need no name, then the races the search covers, by distance. The
 * links are fixed addresses, so the search text never travels with them.
 */
export function NoMatchNext() {
  return <div className="runner-nomatch">
    <nav className="runner-nomatch-next" aria-label="Start without a name"><ul className="runner-rows">
      <li><Link className="runner-row" href="/analyses/finish-time-context"><b>Compare a finish time</b><span>Where a time falls among comparable recorded finishes.</span><Arrow /></Link></li>
      <li><Link className="runner-row" href="/tools/split-check"><b>Have your splits? Check them</b><span>Paste your mat times to see how you paced.</span><Arrow /></Link></li>
      <li><Link className="runner-row" href="/request-analysis"><b>Ask for your race</b><span>Tell Andrew which race or year is missing.</span><Arrow /></Link></li>
    </ul></nav>
    <nav className="runner-covered" aria-label="The races searched"><ul className="runner-rows">
      <li><Link className="runner-row" href="/courses"><b>The marathons searched</b><span>Every marathon with recorded results, and its years.</span><Arrow /></Link></li>
      <li><Link className="runner-row" href="/half"><b>Half marathons</b><span>The half marathon results and what they show.</span><Arrow /></Link></li>
    </ul></nav>
  </div>;
}
