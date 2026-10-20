import RacePlan, { type PlanCourse, type PlanExample } from '@/components/tools/RacePlan';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { pageMetadata } from '@/lib/seo';
import type { CourseGoal, PaceBandIndex, ProjectorIndex, WeatherMatch } from '@/lib/tools/data';
import { courseSlug } from '@/lib/tools/links';
import { PACE_BAND_INDEX } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, goalShare, screenedReason } from '@/lib/tools/plan';

export const metadata = pageMetadata({
  title: 'Marathon Race Planner: Goal Pace by Course | Pace Notes',
  description: 'Plan a marathon goal on your course: splits for every mat, in its shape where finishes allow, how that pace held up there, and a pace band to print.',
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

/**
 * The example's lead (4:00 on every course), read here from the verified course-goal file the page loads in the browser,
 * so the first paint opens on it: the pooled share and every listed course with 100 such finishes, lowest first.
 */
function planExample(goal: CourseGoal | null): PlanExample | null {
  if (!goal) return null;
  const minutes = EXAMPLE_PROFILE.goal;
  const share = goalShare(goal.rows, minutes);
  if (!share) return null;
  const listed = new Set(goal.courses.map((c) => c.city));
  const rows = goal.rows.filter((r) => r.goal === minutes && listed.has(r.city) && r.n >= 100).sort((a, b) => a.under - b.under || a.city.localeCompare(b.city));
  return { minutes, tolerance: goal.tolerance, n: share.n, under: share.under, courses: share.courses, rows };
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
      <RacePlan courseGoalSha={courseGoalSha} paceBandSha={paceBandSha} courses={courses} example={courseGoalSha ? planExample(goal) : null} how="/methodology#tools-plan" />
      <ToolEnd path="/tools/plan" how="/methodology#tools-plan" numbers />
    </div>
  );
}
