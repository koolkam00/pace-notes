import { UnitLink as Link } from '@/components/UnitsProvider';
import { RouteMap } from '@/components/story/CourseArt';
import { Distance, Elevation } from '@/components/story/Units';
import { count, yearList, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import { Fact } from './Fact';

/** "a" or "an" before a race name. */
export const article = (name: string) => (/^[AEIOU]/i.test(name) ? 'an' : 'a');

/**
 * The night hero: the race name as the data has it, what the data holds for it, and the way into the planner, with
 * the pace band and split check for the courses the pace band publishes.
 */
export default function CourseHero({ page }: { page: CoursePageData }) {
  const { summary, geometry, race, slug } = page;
  return (
    <section className="night night-grain bleed story-hero course-hero" data-track-section="hero">
      <div className="container course-hero-grid">
        <div>
          <p className="eyebrow"><Link href="/courses">Courses</Link> · Course profile</p>
          <h1 className="story-title">{race}</h1>
          <dl className="course-stats">
            <div>
              <dt>Editions in the data</dt>
              <dd><Fact k="editions" v={summary.editions}>{count(summary.editions)}</Fact></dd>
              <dd className="course-stat-sub"><Fact k="years" v={summary.years.join(',')}>{yearList(summary.years)}</Fact></dd>
            </div>
            <div><dt>Finishes with all nine 5 km splits</dt><dd><Fact k="finishes" v={summary.finishes}>{count(summary.finishes)}</Fact></dd></div>
            {geometry ? (
              <>
                <div><dt>Supplied route</dt><dd><Fact k="geo.distance" v={geometry.distance_km}><Distance km={geometry.distance_km} /></Fact></dd></div>
                <div><dt>Climb, smoothed route profile</dt><dd><Fact k="geo.gain" v={geometry.gain_m}><Elevation metres={geometry.gain_m} /></Fact></dd></div>
              </>
            ) : null}
          </dl>
          {geometry ? null : <p className="hero-dek course-hero-note">No supplied route file is available for this course, so this page has no elevation profile.</p>}
          <div className="hero-actions">
            <Link className="button-accent" href={planHref(page.city) ?? '/tools/plan'}>Plan your {race}</Link>
            {page.scopes.band ? <Link className="button-secondary" href={`/tools/pace-band?course=${slug}`}>Make {article(race)} {race} pace band</Link> : null}
            {page.scopes.band ? <Link className="button-secondary" href={`/tools/split-check?course=${slug}`}>Check your {race} splits</Link> : null}
          </div>
        </div>
        {geometry ? <div className="course-hero-map"><RouteMap course={geometry} size={420} stroke="#F5F0E6" glow /></div> : null}
      </div>
    </section>
  );
}
