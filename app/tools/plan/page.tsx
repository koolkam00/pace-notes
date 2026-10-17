import RacePlan, { type PlanCourse } from '@/components/tools/RacePlan';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { pageMetadata } from '@/lib/seo';
import type { CourseGoal, PaceBandIndex, ProjectorIndex, WeatherMatch } from '@/lib/tools/data';
import { courseSlug } from '@/lib/tools/links';
import { PACE_BAND_INDEX } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, screenedReason } from '@/lib/tools/plan';

export const metadata = pageMetadata({
  title: 'Marathon Race Planner: Goal Pace by Course | Pace Notes',
  description: 'Plan a marathon goal on your course: even-pace splits for every mat, how finishes at that pace held up there, and a pace band to print.',
  path: '/tools/plan',
});

/** Read one optional insight file; null when it is not in this build or cannot be read. */
function optional<T>(name: string): T | null {
  try {
    return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
  } catch {
    return null;
  }
}

/** A set built from a reader that may fail at build time (the course pages); empty when it does. */
function safeSet(read: () => string[]): Set<string> {
  try {
    return new Set(read());
  } catch {
    return new Set();
  }
}

/**
 * The courses the planner offers, alphabetical: every course in the course-goal file, plus any whose editions were all
 * screened out (named with the reason). Each carries only its name, slug and which tools and pages publish it, read from
 * their own index files, so no link names a course its target does not have.
 */
function planCourses(goal: CourseGoal | null, band: PaceBandIndex | null): PlanCourse[] {
  const projector = optional<ProjectorIndex>('tools/projector.json');
  const weather = optional<WeatherMatch>('tools/weather-match.json');
  const listed = new Set((goal?.courses ?? []).map((c) => c.city));
  const cities = new Set([...listed, ...[...(goal?.screens?.start_offset ?? []), ...(goal?.screens?.grid ?? [])].map((e) => e.city),
    ...(band?.scopes ?? []).flatMap((s) => (s.city ? [s.city] : []))]);
  const bandSlugs = new Set((band?.scopes ?? []).map((s) => s.slug));
  const projectorSlugs = new Set((projector?.scopes ?? []).map((s) => s.slug));
  const weatherSlugs = new Set((weather?.editions ?? []).map((e) => courseSlug(e.city)));
  const pages = safeSet(() => getCourseNames().map(slugifyCity));
  return [...cities].sort((a, b) => a.localeCompare(b)).map((city) => {
    const slug = courseSlug(city);
    return {
      slug, city, screened: goal && !listed.has(city) ? screenedReason(city, goal.screens) : null,
      band: bandSlugs.has(slug), projector: projectorSlugs.has(slug), weather: weatherSlugs.has(slug), page: pages.has(slug),
    };
  });
}

export default function PlanPage() {
  const manifest = getInsightsManifest();
  const courseGoalSha = manifest.files[COURSE_GOAL_FILE]?.sha256 ?? null;
  const paceBandSha = manifest.files[PACE_BAND_INDEX]?.sha256 ?? null;
  const goal = optional<CourseGoal>(COURSE_GOAL_FILE);
  const band = optional<PaceBandIndex>(PACE_BAND_INDEX);
  const courses = planCourses(goal, band);

  return (
    <div className="tool-page">
      <ToolHeader slug="plan" />
      <RacePlan courseGoalSha={courseGoalSha} paceBandSha={paceBandSha} courses={courses} />
      <ToolEnd path="/tools/plan" how="/methodology#tools-plan" />
    </div>
  );
}
