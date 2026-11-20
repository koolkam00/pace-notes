import RacePlan, { type PlanCourse, type PlanExample } from '@/components/tools/RacePlan';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { pageMetadata } from '@/lib/seo';
import type { CourseGoal, PaceBandIndex } from '@/lib/tools/data';
import { PACE_BAND_INDEX } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, goalShare } from '@/lib/tools/plan';
import { TERRAIN_FILE, type TerrainIndex } from '@/lib/tools/terrain-data';
import { optionalInsight, planCourses } from '@/lib/tools/plan-courses';

export const metadata = pageMetadata({
  title: 'Marathon Race Planner: Goal Pace by Course | Pace Notes',
  description: 'Plan a marathon goal on your course: splits for every mat, with its climbs and bridges where the route is checked, how that pace held up there, and a pace band to print.',
  path: '/tools/plan',
});

/** Read one optional insight file; null when it is not in this build or cannot be read (lib/tools/plan-courses.ts). */
const optional = optionalInsight;

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
  const terrainIndex = optional<TerrainIndex>(TERRAIN_FILE);
  const courses = planCourses(goal, band, terrainIndex);

  return (
    <div className="tool-page">
      <ToolHeader slug="plan" />
      <RacePlan courseGoalSha={courseGoalSha} paceBandSha={paceBandSha} courses={courses} example={courseGoalSha ? planExample(goal) : null} how="/methodology#tools-plan" />
      <ToolEnd path="/tools/plan" how="/methodology#tools-plan" numbers />
    </div>
  );
}
