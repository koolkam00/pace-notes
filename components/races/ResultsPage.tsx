import BigNumber from '@/components/ui/BigNumber';
import Button from '@/components/ui/Button';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { SplitTierTag, TagGroup, TierTag, TimingClassTag } from '@/components/ui/TierTag';
import { HowLink } from '@/components/ui/Values';
import { UnitLink as Link } from '@/components/UnitsProvider';
import CourseOthers from '@/components/course/CourseOthers';
import { hasLinkedYears, LinkedYearCell, LinkedYearHead, LinkedYearNote } from './LinkedYear';
import EditionLine from '@/components/course/EditionLine';
import { CourseSection, CourseTable, Fact, Said } from '@/components/course/Fact';
import { howWeKnowOf, readingAttrs } from '@/lib/chapters';
import { clock, count, finishMinute } from '@/lib/course-page';
import { getNugget } from '@/lib/nuggets';
import { JsonLd, pageCrumbs } from '@/lib/seo';
import { raceFile } from '@/lib/races-server';
import { raceDisplayName, type RacePage } from '@/lib/races-types';
import { SPLIT_TIERS } from '@/lib/tiers';

/** The fewest edition medians the line draws: a statement across editions needs three (AGENTS rule 13). */
export const RESULTS_LINE_MIN = 3;

/**
 * A results page (/courses/<slug>, page type `results`: plan decision D15; docs/RACES.md rule 8): a race with three or
 * more verified years of 100 results and no pacing figures. It names the race and its place ("Finish times only" under
 * the H1 where no edition has checkpoint times), states its reading (the race file's median finish in a typical verified
 * year) only under race.reading's guard, else a neutral count, draws the median finish by year as one line (the race
 * file's edition medians, the editions of the finish-time universe with 100 finishes), lists every edition with its
 * labels, and offers the runner search and the planner with no course preset. No pacing word: the race has no pacing
 * figure. Every sentence is a nugget (lib/nuggets/courses.ts); every figure a checked <data> (scripts/verify-courses.cjs).
 * A race whose platform title misleads is named by its label (docs/RACES.md rule 6).
 */
export default function ResultsPage({ page }: { page: RacePage }) {
  const race = raceFile(page.slug);
  const name = raceDisplayName(race);
  const city = race.label;
  const dek = getNugget('race.editions', { city });
  const reading = getNugget('race.reading', { city });
  const range = getNugget('race.range', { city });
  const shown = race.editions.filter((e) => e.review !== 'copy');
  const medians = shown.filter((e): e is typeof e & { median_s: number; finishes: number } => typeof e.median_s === 'number' && typeof e.finishes === 'number');
  const latest = medians[medians.length - 1];
  const finishTimesOnly = page.with_checkpoint_times === 0;
  const how = howWeKnowOf(`/courses/${page.slug}`);
  // The year's verdict for linked runners, a column only where some year has one.
  const linked = hasLinkedYears(city, shown.map((e) => e.year));
  return (
    <div className="course-page results-page" {...readingAttrs(`/courses/${page.slug}`, name)} data-race-page="results">
      <JsonLd data={pageCrumbs(`/courses/${page.slug}`, name, { parents: [['Courses', '/courses']] })} />
      <section className="night course-hero is-routeless is-stripless" data-track-section="hero">
        <div className="course-hero-head">
          <div className="reading-crumbs t-kicker course-crumbs"><ChapterCrumbs path={`/courses/${page.slug}`} place={<Link href="/courses" className="crumb-courses">Courses</Link>} /></div>
          <h1 className="course-title t-title">{name}</h1>
          {finishTimesOnly ? <p className="results-tags"><SplitTierTag splitTier={SPLIT_TIERS[1]} /></p> : null}
          <p className="hero-dek">{race.place ? <>{race.place}{' · '}</> : null}<Said nugget={dek} /></p>
        </div>
        {reading.guard && reading.figure ? (
          <div className="course-hero-figure">
            <BigNumber value={reading.figure.value} sr={reading.figure.sr} size="xl" tone="night" />
            <p className="course-hero-key">{reading.key}</p>
          </div>
        ) : null}
      </section>
      {medians.length >= RESULTS_LINE_MIN && latest ? (
        <CourseSection id="finish-times" track="chapter-2" beat="Finish times" title={<Said nugget={range} />}>
          <EditionLine points={medians.map((e) => ({ year: e.year, seconds: e.median_s, display: finishMinute(e.median_s), side: count(e.finishes) }))}
            selected={latest.year} sideLabel="Finishes" label={`Median finish in ${name}, edition by edition, ${medians[0].year} to ${latest.year}`} height={140} heightMd={200} />
        </CourseSection>
      ) : null}
      <CourseSection id="editions" beat="Editions" title={`${name}, edition by edition`}>
        <CourseTable id="results-editions-caption" caption={`${name}: each edition, the status of its results and its finish times`} captionHidden>
          <thead>
            <tr><th scope="col">Year</th><th scope="col" className="is-text">Status</th><th scope="col">Recorded results</th><th scope="col">Finishes</th><th scope="col">Median finish</th><th scope="col">Middle half</th>{linked ? <LinkedYearHead /> : null}</tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.year} data-edition={e.year}>
                <th scope="row">{e.year}</th>
                {/* The edition's labels from the shared module: its tier, "Finish times only" and "Gun times" where they apply. */}
                <td className="is-text"><TagGroup><TierTag tier={e.tier} /><SplitTierTag splitTier={e.split_tier} /><TimingClassTag timing={e.timing} /></TagGroup></td>
                <td><Fact k={`rr@${e.year}`} v={e.results}>{count(e.results)}</Fact></td>
                <td>{typeof e.finishes === 'number' ? <Fact k={`rf@${e.year}`} v={e.finishes}>{count(e.finishes)}</Fact> : '—'}</td>
                <td>{typeof e.median_s === 'number' ? <Fact k={`rm@${e.year}`} v={e.median_s}>{clock(e.median_s)}</Fact> : '—'}</td>
                <td>{typeof e.p25_s === 'number' && typeof e.p75_s === 'number'
                  ? <span className="nowrap"><Fact k={`rq1@${e.year}`} v={e.p25_s}>{clock(e.p25_s)}</Fact>–<Fact k={`rq3@${e.year}`} v={e.p75_s}>{clock(e.p75_s)}</Fact></span> : '—'}</td>
                {linked ? <LinkedYearCell label={city} year={e.year} /> : null}
              </tr>
            ))}
          </tbody>
        </CourseTable>
        {linked ? <LinkedYearNote /> : null}
        {how ? <HowLink href={how} /> : null}
      </CourseSection>
      <section id="find" tabIndex={-1} className="course-beat results-ways" aria-labelledby="find-title" data-beat="Find" data-track-section="cta">
        <h2 id="find-title" className="course-h2">Look up a result</h2>
        <div className="course-beat-body results-ways-body">
          <Button href="/runners" variant="secondary" arrow="right">Find a runner’s results</Button>
          <Button href="/tools/plan" variant="tertiary">Plan a marathon</Button>
        </div>
      </section>
      <CourseOthers page={page} />
    </div>
  );
}
