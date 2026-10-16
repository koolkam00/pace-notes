import { notFound } from 'next/navigation';
import PageFeedback from '@/components/PageFeedback';
import HeroReplay from '@/components/story/HeroReplay';
import CourseAbout from '@/components/course/CourseAbout';
import CourseElevation from '@/components/course/CourseElevation';
import CourseFinishTimes from '@/components/course/CourseFinishTimes';
import CourseGlance from '@/components/course/CourseGlance';
import CourseGoals from '@/components/course/CourseGoals';
import CourseHero from '@/components/course/CourseHero';
import CourseOthers from '@/components/course/CourseOthers';
import CoursePacing from '@/components/course/CoursePacing';
import CoursePlan from '@/components/course/CoursePlan';
import CourseSlowdown from '@/components/course/CourseSlowdown';
import CourseWeatherByYear from '@/components/course/CourseWeatherByYear';
import { getIndividualCourseAnswer } from '@/lib/course-data';
import { courseDescription, coursePage, coursePages, courseTitle } from '@/lib/course-page';
import type { Courses, ReplayIndex } from '@/lib/insights';
import { getInsightsManifest, readInsight, replayChoices } from '@/lib/insights-server';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
import '../../tools/tools.css';
import './course.css';

export function generateStaticParams() { return [...coursePages().keys()].map((city) => ({ city })); }

export function generateMetadata({ params }: { params: { city: string } }) {
  const page = coursePage(params.city);
  if (!page) return { title: 'Course not found | Pace Notes', robots: { index: false, follow: true } };
  return pageMetadata({
    title: courseTitle(page.race, !!page.geometry),
    description: courseDescription(page.race, page.summary, !!page.geometry, page.weather.length > 0),
    path: `/courses/${page.slug}`,
  });
}

/**
 * One course page: what the data holds for the race, by year, with its route, pacing, goal times and race mornings, and
 * the way into the planner. Sections and their data are in docs/SEO.md ("Course pages"); every figure is checked against
 * its file by scripts/verify-courses.cjs.
 */
export default function CityPage({ params }: { params: { city: string } }) {
  const page = coursePage(params.city);
  const profile = page && getIndividualCourseAnswer(page.city);
  if (!page || !profile) notFound();
  const courses = readInsight<Courses>('courses.json');
  const replay = readInsight<ReplayIndex>('replay.json').editions.filter((e) => e.city === page.city);
  const choices = replayChoices(replay, getInsightsManifest(), new Map(page.geometry ? [[page.city, { points: page.geometry.route, km: page.geometry.route_km }]] : []));
  return (
    <div className="course-page">
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Courses', '/courses'], [page.race]])} />
      <CourseHero page={page} />
      <CourseGlance page={page} />
      <CourseFinishTimes page={page} />
      <CourseElevation page={page} />
      <CoursePacing page={page} typical={courses.typical_curve} shapeCourses={courses.shape_cohort.courses} profile={profile} />
      <CourseSlowdown page={page} />
      <CourseGoals page={page} />
      <CourseWeatherByYear page={page} />
      <CoursePlan page={page} />
      {choices.length ? (
        <section className="chapter course-section" id="replay" aria-labelledby="replay-title">
          <div className="chapter-head"><p className="chapter-num">Replay</p><h2 id="replay-title" className="chapter-title">Watch {page.display} {choices[0].year} unfold.</h2></div>
          <div className="chapter-body night replay-stage"><HeroReplay choices={choices} initial={choices[0].slug} /></div>
        </section>
      ) : null}
      <CourseAbout page={page} />
      <PageFeedback className="course-feedback" />
      <CourseOthers page={page} total={coursePages().size} />
    </div>
  );
}
