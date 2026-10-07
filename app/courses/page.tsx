import { UnitLink as Link } from '@/components/UnitsProvider';
import { formatNumber } from '@/lib/csv';
import { getCourseNames, getIndividualCourseAnswer, slugifyCity } from '@/lib/course-data';
import { readInsight } from '@/lib/insights-server';
import type { Archetypes, CourseGeometry } from '@/lib/insights';
import { RouteMap } from '@/components/story/CourseArt';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';
import { Elevation } from '@/components/story/Units';

export const metadata = { title: 'Courses | Pace Notes', description: 'Route maps, elevation and pacing patterns for every marathon in the study.' };

export default function CoursesPage() {
  const names = getCourseNames();
  const geometry = new Map(readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses.map((c) => [c.city, c]));
  const archetypes = readInsight<Archetypes>('archetypes.json');
  const types = new Map(archetypes.courses.map((c) => [c.city, c]));
  return (
    <div className="courses-page">
      <section className="night night-grain bleed story-hero">
        <div className="container">
          <p className="eyebrow">Courses</p>
          <h1 className="story-title">Every course has a fingerprint.</h1>
          <p className="hero-dek">{names.length} marathons, {names.filter((n) => geometry.has(n)).length} of them drawn from a supplied route file. Open a course for its elevation, how its finishers pace it and how often they hold steady.</p>
          <div className="legend-row on-night">{archetypes.archetypes.map((a, i) => <span key={a.slug}><i className="swatch" style={{ background: ARCHETYPE_COLOURS[i] }} />{a.name}</span>)}</div>
        </div>
      </section>
      {names.length ? (
        <ol className="course-grid">
          {names.map((city) => {
            const individual = getIndividualCourseAnswer(city);
            const g = geometry.get(city);
            const t = types.get(city);
            return (
              <li key={city}>
                <Link href={`/courses/${slugifyCity(city)}`} className="course-card">
                  <span className="course-card-map">{g ? <RouteMap course={g} size={180} animate={false} /> : <span className="course-card-nomap">No supplied route</span>}</span>
                  <span className="course-card-body">
                    <span className="course-card-name">{city === 'New York' ? 'New York City' : city}</span>
                    <span className="course-card-meta">{formatNumber(individual?.dataset?.n || 0, 'finishes')} with complete splits</span>
                    {g ? <span className="course-card-meta">Supplied route climbs <Elevation metres={g.gain_m} /></span> : null}
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
