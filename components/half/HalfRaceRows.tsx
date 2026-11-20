import { SplitTierTag, TagGroup, TierLine, TierTag, TimingClassTag } from '@/components/ui/TierTag';
import type { HalfRace, HalfRaceDirectory } from '@/lib/half-types';

/**
 * A half race and its years, as /half/races draws them (docs/HALF_MARATHON.md, rule R6). No client script, so the page's
 * static list and its on-demand list (HalfRacesAll.client.tsx) draw the same rows. An edition line holds its year, its
 * labels (the tier, then "Finish times only" and "Gun times" where they apply, drawn by the tier module's components as
 * bare labels; the file stores the timing class, so the rows draw TimingClassTag and no client script carries the
 * module's list of timing-basis texts: the page's key line links their definitions once), a mark where the course is suspected to have been
 * short, its results, and a median finish only where the file has one (a verified year of at least 100 results with no
 * mark). An edition set aside as a copy of another is not shown. Names are the release's own; nothing here is a
 * runner's name, a rank or a comparison between years or races.
 */

type Codes = HalfRaceDirectory['codes'];

const whole = new Intl.NumberFormat('en-US');
/** Seconds as h:mm:ss, the whole second at or below. */
const hms = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const MARK_WORDS: Record<string, string> = { course_suspected_short: 'Course suspected short' };

/** A race's years in one line: "2014 to 2026", or the one year. */
export const raceYears = (race: HalfRace) => (race.years[0] === race.years[1] ? String(race.years[0]) : `${race.years[0]} to ${race.years[1]}`);
/** The place, when the key states one apart from the name. */
export const racePlace = (race: HalfRace) => (race.place && race.place !== race.name ? race.place : null);

/** The editions of one race as a table: a year a row. */
export function RaceEditions({ race, codes }: { race: HalfRace; codes: Codes }) {
  const shown = race.editions.filter((e) => codes.review[e[9]] !== 'copy');
  return (
    <div className="table-wrap">
      <table className="table half-race-editions">
        <thead><tr><th scope="col">Year</th><th scope="col" className="is-text">Labels</th><th scope="col">Results</th><th scope="col">Median finish</th></tr></thead>
        <tbody>
          {shown.map((e, i) => (
            <tr key={`${e[0]}-${i}`}>
              <th scope="row">{e[0]}</th>
              <td className="is-text">
                <TagGroup link={false}><TierTag tier={codes.tier[e[1]]} link={false} /><SplitTierTag splitTier={codes.split_tier[e[2]]} link={false} /><TimingClassTag timing={codes.timing[e[6]]} link={false} /></TagGroup>
                {e[7] !== null ? <span className="half-race-mark"> {MARK_WORDS[codes.mark[e[7]]]}</span> : null}
              </td>
              <td>{e[3] === null ? '—' : whole.format(e[3])}</td>
              <td>{e[8] === null ? '—' : hms(e[8])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A race as a fold: its line closed, its years inside. */
export function RaceFold({ race, codes }: { race: HalfRace; codes: Codes }) {
  const place = racePlace(race);
  return (
    <details className="values half-race-fold">
      <summary>
        {/* The name on its own line, then its facts and tier line in the quiet tone (review round M8, November 20, 2026). */}
        <span><span className="race-name">{race.name}</span><span className="half-race-facts">{place ? <><span className="race-place">{place}</span>{' · '}</> : null}{raceYears(race)}{' · '}<TierLine counts={race.tiers} format={(n) => whole.format(n)} /></span></span>
        <span className="values-glyph" aria-hidden="true" />
      </summary>
      <div className="values-body"><RaceEditions race={race} codes={codes} /></div>
    </details>
  );
}
