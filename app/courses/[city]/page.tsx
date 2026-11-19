import { notFound } from 'next/navigation';
import CourseEditionList from '@/components/course/CourseEditionList';
import CourseElevation, { elevationShown } from '@/components/course/CourseElevation';
import CourseFinishTimes, { timesShown } from '@/components/course/CourseFinishTimes';
import CourseGlance, { glanceRows } from '@/components/course/CourseGlance';
import CourseGoals from '@/components/course/CourseGoals';
import CourseHero from '@/components/course/CourseHero';
import CourseNumbers from '@/components/course/CourseNumbers';
import CourseOthers from '@/components/course/CourseOthers';
import CoursePacing from '@/components/course/CoursePacing';
import CourseSlowdown from '@/components/course/CourseSlowdown';
import CourseToc from '@/components/course/CourseToc';
import CourseWeatherByYear, { WEATHER_MIN_MORNINGS } from '@/components/course/CourseWeatherByYear';
import ResultsPage from '@/components/races/ResultsPage';
import { readingAttrs } from '@/lib/chapters';
import { getNugget } from '@/lib/nuggets';
import { profileUnderWater } from '@/lib/nuggets/courses';
import { courseDescription, courseList, coursePage, courseRouteSlugs, courseTitle, MAX_DESCRIPTION, MAX_TITLE } from '@/lib/course-page';
import { resultsPages } from '@/lib/races-server';
import { raceDisplayName } from '@/lib/races-types';
import { JsonLd, pageCrumbs, pageMetadata } from '@/lib/seo';
import '@/app/styles/pages/course.css';

// Every race with a page in the race directory (public/data/races/pages.json): its course pages (full or list-only;
// courseRouteSlugs checks they are the directory's) and its results pages, the second template (November 19, 2026).
export function generateStaticParams() { return [...courseRouteSlugs(), ...resultsPages().keys()].map((city) => ({ city })); }

export function generateMetadata({ params }: { params: { city: string } }) {
  const results = resultsPages().get(params.city);
  // A results page: the race, its place and its years, with no pacing word (it has no pacing figure).
  if (results) {
    const name = raceDisplayName(results);
    const branded = `${name}: Finish Times by Year | Pace Notes`;
    const [first, last] = results.years;
    const where = results.place ? ` in ${results.place}` : '';
    const describe = (place: string) => `${name}${place}: the median finish of each year and every edition from ${first} to ${last}, with the status of its results.`;
    const plain = `${name}: Finish Times by Year`;
    // The longest wording that fits: the brand, then without it, then the race's name alone; the description likewise.
    const description = [describe(where), describe(''), `${name}: the median finish of each year, ${first} to ${last}.`].find((d) => d.length <= MAX_DESCRIPTION) ?? `${name}: finish times by year.`;
    return pageMetadata({
      title: branded.length <= MAX_TITLE ? branded : plain.length <= MAX_TITLE ? plain : name,
      description,
      path: `/courses/${results.slug}`,
    });
  }
  const page = coursePage(params.city);
  const list = page ? null : courseList(params.city);
  // A course with no counted edition: the page lists its editions and states no figure, and so do its title and description.
  if (list) {
    const branded = `${list.race}: Editions | Pace Notes`;
    const years = list.listed.map((e) => e.year);
    return pageMetadata({
      title: branded.length <= MAX_TITLE ? branded : `${list.race}: Editions`,
      description: `${list.race}: its ${list.listed.length === 1 ? `${years[0]} edition` : `${list.listed.length} editions, ${years[0]}–${years[years.length - 1]}`}, each with the status of its results.`,
      path: `/courses/${list.slug}`,
    });
  }
  if (!page) return { title: 'Course not found | Pace Notes', robots: { index: false, follow: true } };
  // The title and description name elevation only where the page prints the route's climb: a supplied route whose
  // profile does not read the water under a bridge. Where it does (New York and Dubai) the hero, #elevation and "All
  // numbers" print no climb, descent or net, so a route file alone promised what the page does not show (until
  // November 9, 2026 both took `!!page.geometry`). verify-seo's course-elevation check reads the built pages.
  const elevation = !!page.geometry && !profileUnderWater(page);
  return pageMetadata({
    title: courseTitle(page.race, elevation),
    description: courseDescription(page.race, { finishes: page.summary.finishes, ...page.counted }, elevation, page.weather.length > 0),
    path: `/courses/${page.slug}`,
  });
}

/**
 * One course page (the redesign spec, sections 4.3 and 7.10, cut under section 00): the night hero with the race's
 * reading, then one finding and one chart per section in the pinned order (at a glance, finish times, elevation,
 * pacing, sustained slowdown, goals, weather), each only where the course's data gives it something to show, every long
 * table in one "All numbers" disclosure, then the closing stack every page ends on (#other-courses). The hero's "Plan your
 * …" is #plan, the page's call to action. The contents row lists the findings only. Sections and their data are in docs/SEO.md ("Course pages"); every figure is
 * checked against its file by scripts/verify-courses.cjs and every sentence by scripts/verify-nuggets.cjs.
 */
export default function CityPage({ params }: { params: { city: string } }) {
  const results = resultsPages().get(params.city);
  if (results) return <ResultsPage page={results} />;
  const page = coursePage(params.city);
  const list = page ? null : courseList(params.city);
  if (list) {
    return (
      <div className="course-page" {...readingAttrs(`/courses/${list.slug}`, list.race)}>
        <JsonLd data={pageCrumbs(`/courses/${params.city}`, list.race, { parents: [['Courses', '/courses']] })} />
        <CourseEditionList course={list} />
        <CourseOthers page={list} />
      </div>
    );
  }
  if (!page) notFound();
  // A section shows only when it has something to show: no heading over an empty chart.
  const glance = glanceRows(page);
  const shown: [string, string, boolean][] = [
    ['at-a-glance', 'At a glance', glance.length > 0], ['finish-times', 'Finish times', timesShown(page)],
    ['elevation', 'Elevation', elevationShown(page)], ['pacing', 'Pacing', !!page.types], ['slowdown', 'Slowdowns', true], ['goals', 'Goals', page.goals.length > 0],
    // #weather only where its sentence is a finding (a pair of mornings): a span of temperatures is none (round 6).
    ['weather', 'Weather', !!page.hotCool && page.weather.length >= WEATHER_MIN_MORNINGS && getNugget('course.weather', { city: page.city }).guard],
  ];
  const sections = shown.filter(([, , on]) => on).map(([id, name]) => [id, name] as [string, string]);
  return (
    <div className="course-page" {...readingAttrs(`/courses/${page.slug}`, page.race)}>
      <JsonLd data={pageCrumbs(`/courses/${params.city}`, page.race, { parents: [['Courses', '/courses']] })} />
      <CourseHero page={page} />
      {/* The contents row only where it saves scrolling: four sections or more (round 6: three chips over a three-section
          page were chrome a single scroll does without). */}
      {sections.length >= 4 ? <CourseToc sections={sections} /> : null}
      <CourseGlance page={page} />
      <CourseFinishTimes page={page} />
      <CourseElevation page={page} />
      <CoursePacing page={page} />
      <CourseSlowdown page={page} />
      <CourseGoals page={page} />
      <CourseWeatherByYear page={page} />
      <CourseNumbers page={page} />
      <CourseOthers page={page} />
    </div>
  );
}
