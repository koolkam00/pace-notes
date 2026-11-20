import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import { StoryHero } from '@/components/story/StoryPage';
import { TierTag, TierTerm } from '@/components/ui/TierTag';
import { getHalfRaceManifest, readHalfRaces } from '@/lib/half-server';
import { dataHref } from '@/components/methods/shared';
import { HALF_NAME, HALF_PATH } from './HalfPage';
import { RaceFold } from './HalfRaceRows';
import HalfRacesAll from './HalfRacesAll.client';

export const HALF_RACES_PATH = '/half/races';
export const HALF_RACES_NAME = 'Half marathon races';

/**
 * /half/races: every half marathon race with results, year by year (docs/HALF_MARATHON.md, rule R6; the files of
 * public/data/half/races/). Static and light: the page opens on the search of every race, then lists, a row each with its years in a fold, the races with three or more years of a
 * verified tier (the file's `full_list`), and every other race comes on demand (HalfRacesAll). No race or year has an
 * address of its own. The root names the scope "races" for verify-half: every year carries its own tier label (drawn by
 * the tier module's components), no figure pools years, no chip is needed and no time is shown for a year that may not
 * show one. The page ranks nothing: races are in name order and years in year order.
 */
export default function HalfRaces() {
  const directory = readHalfRaces('directory.json');
  const summary = readHalfRaces('summary.json');
  const manifest = getHalfRaceManifest();
  const byLabel = new Map(directory.races.map((race) => [race.label, race]));
  const full = directory.full_list.races.map((label) => byLabel.get(label)).filter((race) => race !== undefined);
  return (
    <div className="story-page half-page half-races" data-half-scope="races">
      <article className="story-flow">
        <StoryHero path={HALF_RACES_PATH} title={HALF_RACES_NAME}
          crumbs={<><Link href="/" className="crumb-chapter">Pace Notes</Link><span className="half-crumb-sep" aria-hidden="true">›</span><Link href={HALF_PATH} className="crumb-chapter">{HALF_NAME}</Link><span className="half-crumb-sep" aria-hidden="true">›</span><span className="half-crumb-here" aria-current="page">Races</span></>}
          dek={<>Each race with its years, their results and their labels. <TierTerm>What the labels say</TierTerm></>} />

        {/* The search first, then the short list as rows, each race's years in a fold (review round M8, November 20, 2026:
            every year of the 33 listed races printed before the only search box made the page 29.6 phone screens). */}
        <section id="all" className="beat story-beat" aria-labelledby="all-title" data-beat="Every race">
          <div className="beat-head">
            <h2 id="all-title" className="t-h2 story-beat-title">Every race</h2>
          </div>
          <div className="js-only"><HalfRacesAll sha={manifest.files['directory.json'].sha256} total={summary.races.total.toLocaleString('en-US')} /></div>
          <p className="story-way arrow-line"><a href={dataHref('half/races/editions.csv')} download="pace-notes-half-marathon-races.csv">The whole list as a table (CSV)</a></p>
        </section>

        <section id="listed" className="beat story-beat" aria-labelledby="listed-title" data-beat="Listed in full">
          <div className="beat-head">
            <h2 id="listed-title" className="t-h2 story-beat-title">Listed in full</h2>
            <p className="story-beat-dek">Races with {directory.full_list.min_verified_editions === 3 ? 'three' : directory.full_list.min_verified_editions} or more years labelled <TierTag tier="stamped" link={false} />. Open a race for its years.</p>
          </div>
          {full.map((race) => <RaceFold key={race.label} race={race} codes={directory.codes} />)}
        </section>

        <p className="chapter-end-links">
          <Link href={HALF_PATH} className="chapter-prev"><Arrow dir="left" /><span><span className="sr-only">Back: </span>{HALF_NAME}</span></Link>
        </p>
      </article>
    </div>
  );
}
