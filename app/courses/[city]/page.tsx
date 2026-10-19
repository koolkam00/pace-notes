import { notFound } from 'next/navigation';
import CourseElevation, { elevationShown } from '@/components/course/CourseElevation';
import CourseFinishTimes, { timesShown } from '@/components/course/CourseFinishTimes';
import CourseGlance, { glanceRows } from '@/components/course/CourseGlance';
import CourseGoals from '@/components/course/CourseGoals';
import CourseHero from '@/components/course/CourseHero';
import CourseNumbers from '@/components/course/CourseNumbers';
import CourseOthers from '@/components/course/CourseOthers';
import CoursePacing from '@/components/course/CoursePacing';
import CoursePlan from '@/components/course/CoursePlan';
import CourseSlowdown from '@/components/course/CourseSlowdown';
import CourseToc from '@/components/course/CourseToc';
import CourseWeatherByYear, { WEATHER_MIN_MORNINGS } from '@/components/course/CourseWeatherByYear';
import { readingAttrs } from '@/lib/chapters';
import { courseDescription, coursePage, coursePages, courseTitle } from '@/lib/course-page';
import { JsonLd, pageCrumbs, pageMetadata } from '@/lib/seo';
import '@/app/styles/pages/course.css';

export function generateStaticParams() { return [...coursePages().keys()].map((city) => ({ city })); }

export function generateMetadata({ params }: { params: { city: string } }) {
  const page = coursePage(params.city);
  if (!page) return { title: 'Course not found | Pace Notes', robots: { index: false, follow: true } };
  return pageMetadata({
    title: courseTitle(page.race, !!page.geometry),
    description: courseDescription(page.race, { finishes: page.summary.finishes, ...page.counted }, !!page.geometry, page.weather.length > 0),
    path: `/courses/${page.slug}`,
  });
}

/**
 * One course page (the redesign spec, sections 4.3 and 7.10, cut under section 00): the night hero with the race's
 * reading, then one finding and one chart per section in the pinned order (at a glance, finish times, elevation,
 * pacing, sustained slowdown, goals, weather), each only where the course's data gives it something to show, every long
 * table in one "All numbers" disclosure, then the foot: one quiet line of tools (#plan), one sentence of the courses paced
 * like this one (#other-courses) and the closing stack. The contents row lists the findings only. Sections and their data are in docs/SEO.md ("Course pages"); every figure is
 * checked against its file by scripts/verify-courses.cjs and every sentence by scripts/verify-nuggets.cjs.
 */
export default function CityPage({ params }: { params: { city: string } }) {
  const page = coursePage(params.city);
  if (!page) notFound();
  // A section shows only when it has something to show: no heading over an empty chart.
  const glance = glanceRows(page);
  const shown: [string, string, boolean][] = [
    ['at-a-glance', 'At a glance', glance.length > 0], ['finish-times', 'Finish times', timesShown(page)],
    ['elevation', 'Elevation', elevationShown(page)], ['pacing', 'Pacing', !!page.types], ['slowdown', 'Slowdowns', true], ['goals', 'Goals', page.goals.length > 0],
    ['weather', 'Weather', !!page.hotCool && page.weather.length >= WEATHER_MIN_MORNINGS],
  ];
  const sections = shown.filter(([, , on]) => on).map(([id, name]) => [id, name] as [string, string]);
  return (
    <div className="course-page" {...readingAttrs(`/courses/${page.slug}`, page.race)}>
      <JsonLd data={pageCrumbs(`/courses/${params.city}`, page.race, { parents: [['Courses', '/courses']] })} />
      <CourseHero page={page} />
      <CourseToc sections={sections} />
      <CourseGlance page={page} />
      <CourseFinishTimes page={page} />
      <CourseElevation page={page} />
      <CoursePacing page={page} />
      <CourseSlowdown page={page} />
      <CourseGoals page={page} />
      <CourseWeatherByYear page={page} />
      <CourseNumbers page={page} />
      <CoursePlan page={page} />
      <CourseOthers page={page} />
    </div>
  );
}
