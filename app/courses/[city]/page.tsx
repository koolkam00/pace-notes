import { notFound } from 'next/navigation';
import { UnitLink as Link } from '@/components/UnitsProvider';
import ResearchQuestion from '@/components/ResearchQuestion';
import { getCourseNames, getIndividualCourseAnswer, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { Archetypes, CourseGeometry, Courses, ReplayIndex } from '@/lib/insights';
import { CourseFingerprint, CourseMatched, CourseWeather } from '@/components/story/CourseInsights';
import { Section, Temperature } from '@/components/story/Units';
import { ElevationProfile, RouteMap } from '@/components/story/CourseArt';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';
import HeroReplay, { type ReplayChoice } from '@/components/story/HeroReplay';
import { Distance, Elevation } from '@/components/story/Units';

const slugify = slugifyCity;
export function generateStaticParams() { return getCourseNames().map(city => ({ city: slugify(city) })); }
export function generateMetadata({ params }: { params: { city: string } }) {
  const city = getCourseNames().find(city => slugify(city) === params.city);
  return { title: `${city === 'New York' ? 'New York City' : city || 'Course'} | Pace Notes` };
}

export default function CityPage({ params }: { params: { city: string } }) {
  const name = getCourseNames().find(city => slugify(city) === params.city);
  const individual = name && getIndividualCourseAnswer(name);
  if (!name || !individual) notFound();
  const display = name === 'New York' ? 'New York City' : name;
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses.find((c) => c.city === name);
  const archetypes = readInsight<Archetypes>('archetypes.json');
  const types = archetypes.courses.find((c) => c.city === name);
  const replay = readInsight<ReplayIndex>('replay.json').editions.filter((e) => e.city === name);
  const manifest = getInsightsManifest();
  const choices: ReplayChoice[] = replay.map((e) => ({ ...e, version: manifest.files[e.file].sha256, route: geometry ? { points: geometry.route, km: geometry.route_km } : null }));
  const race = encodeURIComponent(name);
  const steadiest = types ? archetypes.archetypes[types.shares.indexOf(Math.max(...types.shares))] : null;
  const courses = manifest.files['courses.json'] ? readInsight<Courses>('courses.json') : null;
  const summary = courses?.courses.find((c) => c.city === name);
  const shaped = summary && summary.curve && summary.deviation && summary.signature ? { ...summary, curve: summary.curve, deviation: summary.deviation, signature: summary.signature } : null;
  const weather = courses ? courses.weather.editions.filter((e) => e.city === name) : [];
  const hotCool = courses?.weather.hot_cool.find((h) => h.city === name);
  const band = courses?.matched.find((b) => b.lo_s === 300);
  return (
    <div className="course-page">
      <section className="night night-grain bleed story-hero course-hero">
        <div className="container course-hero-grid">
          <div>
            <p className="eyebrow"><Link href="/courses">Courses</Link> · {geometry?.race ?? `${name} Marathon`}</p>
            <h1 className="story-title">{display}</h1>
            {geometry ? (
              <dl className="course-stats">
                <div><dt>Supplied route</dt><dd><Distance km={geometry.distance_km} /></dd></div>
                <div><dt>Climbing</dt><dd><Elevation metres={geometry.gain_m} /></dd></div>
                <div><dt>Descending</dt><dd><Elevation metres={geometry.loss_m} /></dd></div>
                <div><dt>Lowest to highest</dt><dd><Elevation metres={geometry.min_m} />–<Elevation metres={geometry.max_m} /></dd></div>
              </dl>
            ) : <p className="hero-dek">No supplied route profile is available for this course.</p>}
            <div className="hero-actions">
              <Link className="button-accent" href={`/analyses/course-comparison?race=${race}`}>Compare this course</Link>
              <Link className="button-secondary" href={`/analyses/hills-and-pacing?race=${race}`}>Hills and pacing</Link>
            </div>
          </div>
          {geometry ? <div className="course-hero-map"><RouteMap course={geometry} size={420} stroke="#F5F0E6" glow /></div> : null}
        </div>
        {geometry ? <div className="container course-elevation"><ElevationProfile course={geometry} height={150} /></div> : null}
      </section>
      {types ? (
        <section className="chapter" aria-labelledby="types-title">
          <div className="chapter-head">
            <p className="chapter-num">How {display} is run</p>
            <h2 id="types-title" className="chapter-title">{steadiest ? <>Most often: the <em>{steadiest.name}</em>.</> : 'Pacing types'}</h2>
            <p className="chapter-dek">The mix of pacing types among {types.finishes.toLocaleString('en-US')} eligible finishes across {types.editions} edition{types.editions === 1 ? '' : 's'}, each edition weighted equally. <Link href="/stories/pacing-types">What the types mean</Link>.</p>
          </div>
          <div className="chapter-body course-types-big">
            {archetypes.archetypes.map((a, i) => (
              <div key={a.slug} className="course-type-tile" style={{ ['--arch' as string]: ARCHETYPE_COLOURS[i] }}>
                <strong>{Math.round(types.shares[i] * 100)}%</strong><span>{a.name}</span>
                <small>{Math.round(a.share * 100)}% across all courses</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {shaped && courses ? (
        <section className="chapter" aria-labelledby="fingerprint-title">
          <div className="chapter-head">
            <p className="chapter-num">Course fingerprint</p>
            <h2 id="fingerprint-title" className="chapter-title">Most distinctive: <em><Section i={courses.sections.indexOf(shaped.signature_section ?? '')} /></em>.</h2>
            <p className="chapter-dek">How the median finisher&apos;s pace bends across {shaped.shape_editions} edition{shaped.shape_editions === 1 ? '' : 's'}, against the typical curve across {courses.shape_cohort.courses} courses.
              {shaped.identified ? <> Its shape alone names the course in {shaped.identified.correct} of {shaped.identified.editions} editions. </> : ' '}
              <Link href="/stories/courses">Every course has a fingerprint</Link>.</p>
          </div>
          <div className="chapter-body"><CourseFingerprint course={shaped} typical={courses.typical_curve} /></div>
        </section>
      ) : null}
      {weather.length >= 2 || (band && band.courses.some((c) => c.city === name)) ? (
        <section className="chapter" aria-labelledby="mornings-title">
          <div className="chapter-head">
            <p className="chapter-num">Race mornings</p>
            <h2 id="mornings-title" className="chapter-title">{hotCool ? <>From <em><Temperature c={hotCool.cool.temp} /></em> to <em><Temperature c={hotCool.hot.temp} /></em>.</> : 'Weather and the second half.'}</h2>
            {hotCool ? <p className="chapter-dek">{hotCool.cool.year} started coolest and {(hotCool.cool.slowdown * 100).toFixed(0)}% of finishes had a sustained slowdown; {hotCool.hot.year} started warmest, with {(hotCool.hot.slowdown * 100).toFixed(0)}%.</p> : null}
          </div>
          <div className="chapter-body course-mornings">
            {weather.length >= 2 ? <CourseWeather city={name} editions={weather} /> : null}
            {band && band.courses.some((c) => c.city === name) ? <CourseMatched city={name} band={band} /> : null}
          </div>
        </section>
      ) : null}
      <section className="chapter course-profile">
        <ResearchQuestion question={individual} standalone />
      </section>
      {choices.length ? (
        <section className="chapter" aria-labelledby="replay-title">
          <div className="chapter-head"><p className="chapter-num">Replay</p><h2 id="replay-title" className="chapter-title">Watch {display} {choices[0].year} unfold.</h2></div>
          <div className="chapter-body night replay-stage"><HeroReplay choices={choices} initial={choices[0].slug} /></div>
        </section>
      ) : null}
      <p className="course-back"><Link href="/courses">← All courses</Link></p>
    </div>
  );
}
