import { notFound } from 'next/navigation';
import CourseElevation from '@/components/course/CourseElevation';
import CourseFinishTimes from '@/components/course/CourseFinishTimes';
import CourseGlance from '@/components/course/CourseGlance';
import CourseGoals from '@/components/course/CourseGoals';
import CourseHero from '@/components/course/CourseHero';
import CourseNumbers from '@/components/course/CourseNumbers';
import CourseOthers from '@/components/course/CourseOthers';
import CoursePacing from '@/components/course/CoursePacing';
import CoursePlan from '@/components/course/CoursePlan';
import CourseReplay from '@/components/course/CourseReplay';
import CourseSlowdown from '@/components/course/CourseSlowdown';
import CourseToc from '@/components/course/CourseToc';
import CourseWeatherByYear from '@/components/course/CourseWeatherByYear';
import { readingAttrs } from '@/lib/chapters';
import { courseDescription, coursePage, coursePages, courseTitle } from '@/lib/course-page';
import type { ReplayIndex } from '@/lib/insights';
import { getInsightsManifest, readInsight, replayChoices } from '@/lib/insights-server';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
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
 * pacing, sustained slowdown, goals, weather, plan, replay, other courses), every long table in one "All numbers"
 * disclosure, and the closing stack. Sections and their data are in docs/SEO.md ("Course pages"); every figure is
 * checked against its file by scripts/verify-courses.cjs and every sentence by scripts/verify-nuggets.cjs.
 */
export default function CityPage({ params }: { params: { city: string } }) {
  const page = coursePage(params.city);
  if (!page) notFound();
  const replay = readInsight<ReplayIndex>('replay.json').editions.filter((e) => e.city === page.city);
  const choices = replayChoices(replay, getInsightsManifest(), new Map(page.geometry ? [[page.city, { points: page.geometry.route, km: page.geometry.route_km }]] : []));
  const sections: [string, string][] = [
    ['at-a-glance', 'At a glance'], ['finish-times', 'Finish times'],
    ...(page.geometry ? [['elevation', 'Elevation'] as [string, string]] : []),
    ['pacing', 'Pacing'], ['slowdown', 'Slowdowns'], ['goals', 'Goals'],
    ...(page.weather.length ? [['weather', 'Weather'] as [string, string]] : []),
    ['plan', 'Plan'], ...(choices.length ? [['replay', 'Replay'] as [string, string]] : []),
  ];
  return (
    <div className="course-page" {...readingAttrs(`/courses/${page.slug}`, page.race)}>
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Courses', '/courses'], [page.race]])} />
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
      <CourseReplay page={page} choices={choices} />
      <CourseOthers page={page} />
    </div>
  );
}
