import type { Ref } from 'react';
import type { CopyEdition } from '@/lib/duplicate-editions-shared';
import { LinkTerm, TierTerm } from '@/components/ui/TierTag';
import { POSSIBLE_MATCHES } from '@/lib/tiers';
import { displayName, raceFinish, searchWords, runnerDuration, runnerLists, type RunnerList, type RunnerManifest, type RunnerProfile, type RunnerRace } from '@/lib/runner-search';
import { NO_COPIES, RecordedDetails, RunnerRecordDetails, analysed, raceLabel, showsLinkWords } from './records';

// A runner's profile as /runners lists it (lookup version 2): the name forms on record, then marathons and half
// marathons in two lists, each with its own count, span and fastest recorded finish; in each list the possible matches
// apart, under their own heading, never ticked by the page. Nothing is counted across the two distances and no possible
// match enters a figure (lead decisions D10, D16 and D24.3).

const count = (value: number) => value.toLocaleString('en-US');
const HEADINGS = { marathon: ['Marathon', 'Marathons'], half: ['Half marathon', 'Half marathons'] } as const;

/**
 * A list's own results in one line: how many, the years they span and the fastest recorded finish among them, with
 * the race it was recorded at. The numbers are the list's own (lib/runner-search runnerLists): never one statistic
 * over both distances, never a possible match.
 */
export function listSummary(list: RunnerList, manifest: Pick<RunnerManifest, 'editions'>): string | null {
  const summary = list.summary;
  if (!summary || summary.count < 2) return null;
  const span = summary.firstYear === summary.lastYear ? String(summary.firstYear) : `${summary.firstYear}–${summary.lastYear}`;
  const best = summary.best ? ` · fastest recorded finish ${runnerDuration(raceFinish(summary.best))}, ${raceLabel(summary.best, manifest)}` : '';
  return `${count(summary.count)} results · ${span}${best}`;
}

/**
 * The key line's link part. A row of the runner's own results shows its link's words only when they are not "High"
 * (records.tsx showsLinkWords), so the line says "High" once, and every other tier is on its row.
 */
function linkKey(own: readonly RunnerRace[]): string {
  const high = own.filter(race => !showsLinkWords(race)).length;
  if (high === 0) return ' is shown on each row.';
  if (high < own.length) return ': High unless the row says otherwise.';
  return own.length === 1 ? ': High.' : ': High for every race.';
}

type RowProps = { manifest: RunnerManifest; copyEditions: readonly CopyEdition[]; selected: ReadonlySet<string>; onToggle: (race: RunnerRace) => void };

function Rows({ races, linked, names, possible = false, ...row }: RowProps & { races: RunnerRace[]; linked: boolean; names: readonly string[]; possible?: boolean }) {
  const { manifest, copyEditions, selected, onToggle } = row;
  return <ul className={possible ? 'runner-races runner-possible' : 'runner-races'}>{races.map(race => {
    // A possible match says the name it was recorded under unless the heading is that one name.
    const recordedAs = possible && !(names.length === 1 && names[0] === displayName(race.name));
    // What the row offers once selected (D20): the race report for a counted marathon, its own pacing, or recorded times.
    const offer = !analysed({ race, manifest }, copyEditions) ? 'times' : race.counted ? 'report' : 'pacing';
    return <li className={possible ? 'runner-race is-possible' : 'runner-race'} key={race.key} data-offer={offer}>
      <label className="runner-race-row"><input type="checkbox" checked={selected.has(race.key)} onChange={() => onToggle(race)} /><span className="runner-race-body"><RunnerRecordDetails race={race} manifest={manifest} copyEditions={copyEditions} linked={linked && showsLinkWords(race)} recordedAs={recordedAs} /></span></label>
      {possible || !analysed({ race, manifest }, copyEditions) ? <RecordedDetails race={race} manifest={manifest} copyEditions={copyEditions} /> : null}
    </li>;
  })}</ul>;
}

/**
 * The opened profile. `opened` is the spelling of the search row that opened it: the heading of a group with no result
 * of its own (every result a possible match), which has no name the data confirms.
 */
export default function ProfileView({ profile, manifest, opened, copyEditions = NO_COPIES, selected, onToggle, headingRef }: {
  profile: RunnerProfile; manifest: RunnerManifest; opened: string; copyEditions?: readonly CopyEdition[];
  /** The keys of the races the visitor has ticked, across profiles. */
  selected: ReadonlySet<string>; onToggle: (race: RunnerRace) => void; headingRef?: Ref<HTMLHeadingElement>;
}) {
  const lists = runnerLists(profile, manifest);
  const several = profile.races.length > 1;
  const own = new Set(lists.flatMap(list => list.own).map(race => race.name));
  // The name forms on record, in the order they were first used: of the runner's own results, or the spelling searched.
  // Forms that differ only in word order, case, accents or a trailing code ("Smith, Anne", "Anne Smith · GBR") are
  // one form here: the first is kept, and each record's own spelling stays in its "Recorded details".
  const seen = new Set<string>();
  const names = (own.size ? profile.names.filter(name => own.has(name)) : [opened]).map(displayName).filter(name => {
    const key = searchWords(name.replace(/ · [^·]*$/, '')).slice().sort().join(' ') || name;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const row = { manifest, copyEditions, selected, onToggle };
  return <section className="runner-profile" aria-labelledby="runner-profile-title">
    <h2 id="runner-profile-title" className="runner-h" tabIndex={-1} ref={headingRef}>{names.join(' / ')}</h2>
    <p className="runner-note">{own.size ? 'Tick only the races you recognize. You can add races from other matches too.' : `${count(profile.races.length)} results that may belong together. Tick only the races you recognize.`}</p>
    {lists.map(list => {
      const id = `runner-list-${list.distance}`, summary = listSummary(list, manifest);
      const heading = HEADINGS[list.distance][list.own.length + list.possible.length === 1 ? 0 : 1];
      return <section className="runner-list" key={list.distance} aria-labelledby={id} data-distance={list.distance}>
        <h3 id={id} className="runner-list-h">{heading}</h3>
        {summary ? <p className="runner-list-sum">{summary}</p> : null}
        {list.own.length > 0 && <>
          {/* What each row holds, once per list, in one line; the words link to their definitions (a row is a checkbox
              label, so its own labels are bare). */}
          <p className="runner-list-key">Each row: race, finish and its <TierTerm>results</TierTerm> label.{several ? <> <LinkTerm>Link confidence</LinkTerm>{linkKey(list.own)}</> : null}</p>
          <Rows races={list.own} linked={several} names={names} {...row} />
        </>}
        {list.possible.length > 0 && <div className="runner-possible-block">
          <h4 id={`${id}-possible`} className="runner-possible-h">{POSSIBLE_MATCHES}</h4>
          <p className="runner-note">{list.own.length ? 'Not joined to the results above. ' : ''}Tick one only if you recognize it. Each shows its <TierTerm>results</TierTerm> label and its <LinkTerm>link confidence</LinkTerm>.</p>
          <Rows races={list.possible} linked possible names={names} {...row} />
        </div>}
      </section>;
    })}
  </section>;
}
