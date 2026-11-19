import { matLabel } from '@/lib/units';
import { copyEditionOf, type CopyEdition } from '@/lib/duplicate-editions-shared';
import { LinkLabel, LinkTier, SplitTierTag, TagGroup, TierTag, TimingClassTag } from '@/components/ui/TierTag';
import { NO_FINISH, POINTS_KM, TIERS, displayName, raceFinish, runnerDuration, runnerLink, type RunnerEdition, type RunnerManifest, type RunnerRace } from '@/lib/runner-search';

// One recorded result as the runner pages show it (split out of components/RunnerSearch.tsx for lookup version 2): its
// race and year, its finish, its edition's labels, its link's confidence and its recorded details. The tier and link
// words are drawn by components/ui/TierTag.tsx alone; inside a row that is a checkbox label they are bare labels
// (a label holds no link), and the list's key line links the words to their definitions once.

export const NO_COPIES: readonly CopyEdition[] = [];
type Shown = { race: RunnerRace; manifest: Pick<RunnerManifest, 'editions'> };

/** "Berlin 2019": the race's label and year. A marathon and a half marathon can share both, so a list says which it holds. */
export const raceLabel = (race: RunnerRace, manifest: Pick<RunnerManifest, 'editions'>): string => editionLabel(manifest.editions[race.edition]);
export const editionLabel = (edition: Pick<RunnerEdition, 'city' | 'year' | 'distance'>): string => `${edition.distance === 'marathon' && edition.city === 'New York' ? 'New York City' : edition.city} ${edition.year}`;
/** The distance in a row's own words. */
export const distanceWords = (distance: RunnerRace['distance'], count = 1): string => `${distance === 'marathon' ? 'marathon' : 'half marathon'}${count === 1 ? '' : 's'}`;
/** A record's finish as recorded, in the page's one clock; a result without one says so. */
export const finishLabel = (race: RunnerRace): string => raceFinish(race) === null ? NO_FINISH : runnerDuration(raceFinish(race));

/** A copy edition (lib/duplicate-editions-shared.ts) repeats another year's marathon field, so its records show recorded times only. */
export const inCopyEdition = ({ race, manifest }: Shown, copies: readonly CopyEdition[]): boolean => race.distance === 'marathon' && !!copyEditionOf(manifest.editions[race.edition], copies);
/** A race the pacing and comparison views use: a marathon record with its own pacing view, not in a copy edition. */
export const analysed = (shown: Shown, copies: readonly CopyEdition[]): boolean => shown.race.eligible && !inCopyEdition(shown, copies);

/**
 * A row's short tag for the exception, from the lookup's codes. A counted race, an own-record race (its edition's
 * label already says why it has no peers) and a half marathon say nothing more; a record of an edition without
 * usable splits is marked by its edition's own label.
 */
export function statusTag({ race, manifest }: Shown, copies: readonly CopyEdition[]): string | null {
  const edition = manifest.editions[race.edition];
  if (race.distance === 'half') return edition.noComparison === 2 ? 'Not compared' : null;
  if (race.eligible) return copyEditionOf(edition, copies) ? 'Recorded times only' : null;
  if (race.status === 3) return 'Limited: missing checkpoints';
  if (race.status === 4) return 'Limited: times out of order';
  if (race.status === 6) return edition.splits ? 'Recorded times only' : null;
  return 'Limited analysis';
}

/**
 * An edition's labels in one wrapping group: its tier, then the two that apply only to some. "Gun times" comes from the
 * lookup's own timing class of the edition (`timing`, the editions column `tb`). `link` makes
 * each a link to its definition.
 */
export function EditionLabels({ edition, link = false }: { edition: RunnerEdition; link?: boolean }) {
  return <TagGroup link={link}><TierTag tier={TIERS[edition.tier]} link={link} /><SplitTierTag splitTier={edition.splits ? 'splits' : 'finish_time_only'} link={link} /><TimingClassTag timing={edition.timing} link={link} /></TagGroup>;
}

/**
 * A link's confidence as its row shows it: quiet words for a link that keys a runner; the pill and the quiet words
 * for a possible match, with the screen that left a keyed tier without a runner key (the lookup's `w`, per result).
 */
export function RaceLink({ race }: { race: RunnerRace }) {
  const { confidence, keyed, screened } = runnerLink(race.link);
  if (!confidence) return null;
  if (keyed) return <LinkTier confidence={confidence} keyed />;
  return <LinkLabel confidence={confidence} keyed={false} reason={screened ? race.screen : null} link={false} />;
}

/**
 * A row of a runner's own results shows its link's words only when they are not "High": the list's key line says
 * "High" once (components/runner/ProfileView.tsx). A possible match always shows its pill and its words.
 */
export const showsLinkWords = (race: RunnerRace): boolean => race.possible || race.link !== '2';

/**
 * One recorded race as a row: the race and year and its recorded finish, then its edition's labels (every row shows
 * its tier) with a short tag only for the exception, and, where the row is one of several linked results, its link's
 * confidence. A possible match also says the name it was recorded under when the heading does not. The recorded age,
 * gender, the full reason and the record's key are in its "Recorded details" disclosure (RecordedDetails).
 */
export function RunnerRecordDetails({ race, manifest, copyEditions = NO_COPIES, linked = false, recordedAs = false }: Shown & {
  copyEditions?: readonly CopyEdition[];
  /** The row sits in a profile of several results, so it shows its link's confidence. */
  linked?: boolean;
  /** Say the name the result was recorded under (a possible match whose name the heading does not carry). */
  recordedAs?: boolean;
}) {
  const edition = manifest.editions[race.edition];
  const tag = statusTag({ race, manifest }, copyEditions);
  return <>
    <strong>{raceLabel(race, manifest)}</strong>
    <span className="runner-recorded-finish"><span className="sr-only">Recorded finish: </span>{finishLabel(race)}</span>
    <span className="runner-race-tags"><EditionLabels edition={edition} />{tag ? <span className={tag === 'Recorded times only' ? 'runner-ineligible runner-copy' : 'runner-ineligible'}>{tag}</span> : null}</span>
    {linked ? <span className="runner-race-link"><RaceLink race={race} /></span> : null}
    {recordedAs ? <span className="runner-race-as">Recorded as {displayName(race.name)}</span> : null}
  </>;
}

/**
 * A record opened: the name, race, age and gender as recorded, why a marathon record has no pacing report (the
 * lookup's own sentence; a copy edition's line only where `explainCopy`), the checkpoints that were recorded and the
 * record's key. A half marathon is listed as recorded; nothing here promises more.
 */
export function RecordedDetails({ race, manifest, copyEditions = NO_COPIES, explainCopy = true }: Shown & { copyEditions?: readonly CopyEdition[]; explainCopy?: boolean }) {
  const edition = manifest.editions[race.edition];
  const copy = inCopyEdition({ race, manifest }, copyEditions) && race.eligible;
  const points = POINTS_KM[race.distance];
  const recorded = race.times.slice(0, -1).some(time => time !== null);
  const why = race.distance === 'half' ? (edition.noComparison ? 'This edition’s times are not compared with other races.' : null)
    : !race.eligible ? `${race.reason ?? 'The timings or edition need further verification.'} Pacing and peer comparisons are unavailable for this record.`
      : copy ? (explainCopy ? 'Pacing and peer comparisons are unavailable for this record.' : null)
        : race.counted ? null : `${race.reason ?? ''} This record keeps its own pacing view and is compared with no other finishes.`.trim();
  return <details className="runner-raw values"><summary><span>Recorded details</span><span className="values-glyph" aria-hidden="true" /></summary>
    <p className="runner-note">{race.name} · {edition.race}{race.distance === 'half' ? ' · half marathon' : ''} · {race.age === null ? 'Age not recorded' : `Recorded age ${race.age}${race.age < 18 || race.age > 89 ? ' (outside the usable age range)' : ''}`} · {race.sex ? `Recorded gender ${race.sex}` : 'Gender not recorded'}</p>
    {why ? <p className="runner-note">{why}</p> : null}
    {recorded || edition.splits
      ? <div className="runner-table-wrap table-wrap"><table className="table"><caption className="sr-only">Recorded checkpoints for record {race.key}</caption><thead><tr><th scope="col">Checkpoint</th><th scope="col">Recorded elapsed time</th></tr></thead><tbody>{points.map((end, i) => <tr key={end}><th scope="row">{i === points.length - 1 ? 'Finish' : matLabel(end)}</th><td>{i === points.length - 1 && race.times[i] === null ? NO_FINISH : runnerDuration(race.times[i])}</td></tr>)}</tbody></table></div>
      : <p className="runner-note">Recorded finish: {finishLabel(race)}. No checkpoint time was recorded.</p>}
    <p className="runner-note">Record {race.key}.</p></details>;
}

/** Records listed without a checkbox: the selected records that have no pacing view, each with its row and its details. */
export function RecordList({ races, manifest, copyEditions = NO_COPIES, explainCopy = false }: { races: RunnerRace[]; manifest: Pick<RunnerManifest, 'editions'>; copyEditions?: readonly CopyEdition[]; explainCopy?: boolean }) {
  return <ul className="runner-races runner-limited-records">{races.map(race => <li className="runner-race" key={race.key}><div className="runner-race-row"><span className="runner-race-body"><RunnerRecordDetails race={race} manifest={manifest} copyEditions={copyEditions} /></span></div><RecordedDetails race={race} manifest={manifest} copyEditions={copyEditions} explainCopy={explainCopy} /></li>)}</ul>;
}
