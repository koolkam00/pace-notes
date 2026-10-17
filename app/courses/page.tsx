import { UnitLink as Link } from '@/components/UnitsProvider';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { readInsight } from '@/lib/insights-server';
import type { Archetypes, CourseGeometry, Courses } from '@/lib/insights';
import { RouteMap } from '@/components/story/CourseArt';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';
import { Elevation } from '@/components/story/Units';
import { pct, raceName } from '@/lib/course-page';
import { JsonLd, absoluteUrl, breadcrumbs, pageMetadata } from '@/lib/seo';

const displayName = (city: string) => city === 'New York' ? 'New York City' : city;

export function generateMetadata() {
  const names = getCourseNames();
  const routes = new Set(readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses.map((c) => c.city));
  const drawn = names.filter((n) => routes.has(n)).length;
  const span = names.length > 1 ? `, from ${displayName(names[0])} to ${displayName(names[names.length - 1])}` : '';
  const describe = (from: string) => `Pacing by 5 km section for ${names.length} marathon courses${from}, with route and elevation profiles for ${drawn}. Alphabetical, not ranked.`;
  // Every course has a pacing profile; only those with a supplied route file have elevation, so the title counts both.
  const title = drawn === names.length ? `Marathon Courses: Elevation and Pacing for ${names.length} Races` : `Marathon Courses: Pacing for ${names.length} Races, Elevation for ${drawn}`;
  return pageMetadata({
    title,
    description: describe(span).length <= 155 ? describe(span) : describe(''),
    path: '/courses',
  });
}

export default function CoursesPage() {
  const names = getCourseNames();
  const geometry = new Map(readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses.map((c) => [c.city, c]));
  const archetypes = readInsight<Archetypes>('archetypes.json');
  const types = new Map(archetypes.courses.map((c) => [c.city, c]));
  const summaries = new Map(readInsight<Courses>('courses.json').courses.map((c) => [c.city, c]));
  // The course pages (28 since the 1652 release, 29 before) in the order the page lists them (alphabetical), named as each page's H1 names its race.
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Marathon courses', itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: names.length,
    itemListElement: names.map((city, i) => ({ '@type': 'ListItem', position: i + 1, name: raceName(city, geometry.get(city), summaries.get(city)), url: absoluteUrl(`/courses/${slugifyCity(city)}`) })),
  };
  return (
    <div className="courses-page">
      <JsonLd data={[breadcrumbs([['Pace Notes', '/'], ['Courses']]), list]} />
      <section className="night night-grain bleed story-hero">
        <div className="container">
          <p className="eyebrow">Courses</p>
          <h1 className="story-title">Marathon courses: elevation and pacing.</h1>
          <p className="hero-dek">{names.length} marathons. Open a course for its elevation, how its finishers pace it and how often they hold steady.</p>
          <div className="legend-row on-night">{archetypes.archetypes.map((a, i) => <span key={a.slug}><i className="swatch" style={{ background: ARCHETYPE_COLOURS[i] }} />{a.name}</span>)}</div>
        </div>
      </section>
      {names.length ? (
        <ol className="course-grid">
          {names.map((city) => {
            // The sustained-slowdown share the course page's hero prints (the story data, without copy editions).
            const slowdown = summaries.get(city)?.slowdown;
            const g = geometry.get(city);
            const t = types.get(city);
            return (
              <li key={city}>
                <Link href={`/courses/${slugifyCity(city)}`} className="course-card">
                  <span className="course-card-map">{g ? <RouteMap course={g} size={180} animate={false} /> : <span className="course-card-nomap">No route map</span>}</span>
                  <span className="course-card-body">
                    <span className="course-card-name">{displayName(city)}</span>
                    {slowdown !== undefined ? <span className="course-card-meta">Sustained slowdown {pct(slowdown)}</span> : null}
                    {g ? <span className="course-card-meta">Climbs <Elevation metres={g.gain_m} /></span> : null}
                    {t ? (
                      <span className="course-card-types" aria-label={`Pacing types: ${archetypes.archetypes.map((a, i) => `${a.name} ${Math.round(t.shares[i] * 100)}%`).join(', ')}`}>
                        {t.shares.map((v, i) => <i key={i} style={{ width: `${v * 100}%`, background: ARCHETYPE_COLOURS[i] }} />)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : <p>Course results are not available in this snapshot.</p>}
    </div>
  );
}
