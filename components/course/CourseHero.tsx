import { UnitLink as Link } from '@/components/UnitsProvider';
import { RouteMap } from '@/components/story/CourseArt';
import { Elevation } from '@/components/story/Units';
import { clock, pct, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import { Fact } from './Fact';

/** "a" or "an" before a race name. */
export const article = (name: string) => (/^[AEIOU]/i.test(name) ? 'an' : 'a');

/**
 * The night hero: the race name as the data has it, its headline figures (how often finishes had a sustained slowdown,
 * the median finish and the route's climb), and the way into the planner, with the pace band and split check for the
 * courses the pace band publishes.
 */
export default function CourseHero({ page }: { page: CoursePageData }) {
  const { summary, editions, geometry, race, slug } = page;
  const single = editions.length === 1 ? editions[0] : null;
  return (
    <section className="night night-grain bleed story-hero course-hero" data-track-section="hero">
      <div className="container course-hero-grid">
        <div>
          <p className="eyebrow"><Link href="/courses">Courses</Link> · Course profile</p>
          <h1 className="story-title">{race}</h1>
          <dl className="course-stats">
            <div>
              <dt>Sustained slowdown</dt>
              <dd><Fact k="slowdown" v={summary.slowdown}>{pct(summary.slowdown)}</Fact></dd>
              <dd className="course-stat-sub">{single ? `of finishes in ${single.year}` : 'of finishes in an average edition'}</dd>
            </div>
            <div>
              <dt>Median finish</dt>
              <dd><Fact k="median" v={summary.median_s}>{clock(summary.median_s)}</Fact></dd>
              <dd className="course-stat-sub">{single ? `in ${single.year}` : 'in an average edition'}</dd>
            </div>
            {geometry ? <div><dt>Climb</dt><dd><Fact k="geo.gain" v={geometry.gain_m}><Elevation metres={geometry.gain_m} /></Fact></dd></div> : null}
          </dl>
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
