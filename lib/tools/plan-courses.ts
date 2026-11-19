import type { PlanCourse } from '@/components/tools/RacePlan';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { CourseGoal, PaceBandIndex, ProjectorIndex, WeatherMatch } from '@/lib/tools/data';
import { courseSlug } from '@/lib/tools/links';
import { PACE_BAND_INDEX } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, screenedReason } from '@/lib/tools/plan';
import { TERRAIN_FILE, terrainProps, type TerrainIndex } from '@/lib/tools/terrain-data';

/*
 * The race planner's courses, in one server module (November 19, 2026): the planner (/tools/plan) offers them and the
 * home page's "Plan your race" form lists the same ones, so the form never offers a course the planner cannot preset
 * (verify-seo `home-form`). Moved unchanged from app/tools/plan/page.tsx, where planCourses was a local function.
 */

/** Read one optional insight file; null when it is not in this build or cannot be read. */
export function optionalInsight<T>(name: string): T | null {
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
 * screened out (named with the reason). Each carries only its name, slug, which tools and pages publish it, read from
 * their own index files, so no link names a course its target does not have, and its terrain splits
 * (tools/course-terrain.json, without the route itself) or why it has none. Without the terrain file every course is at
 * even pace, with no line.
 */
export function planCourses(goal: CourseGoal | null, band: PaceBandIndex | null, terrainIndex: TerrainIndex | null): PlanCourse[] {
  const projector = optionalInsight<ProjectorIndex>('tools/projector.json');
  const weather = optionalInsight<WeatherMatch>('tools/weather-match.json');
  const listed = new Set((goal?.courses ?? []).map((c) => c.city));
  const cities = new Set([...listed, ...[...(goal?.screens?.start_offset ?? []), ...(goal?.screens?.grid ?? [])].map((e) => e.city),
    ...(band?.scopes ?? []).flatMap((s) => (s.city ? [s.city] : []))]);
  const bandSlugs = new Set((band?.scopes ?? []).map((s) => s.slug));
  const { terrain, why } = terrainProps(terrainIndex);
  const projectorSlugs = new Set((projector?.scopes ?? []).map((s) => s.slug));
  const weatherSlugs = new Set((weather?.editions ?? []).map((e) => courseSlug(e.city)));
  const pages = safeSet(() => getCourseNames().map(slugifyCity));
  return [...cities].sort((a, b) => a.localeCompare(b)).map((city) => {
    const slug = courseSlug(city);
    return {
      slug, city, screened: goal && !listed.has(city) ? screenedReason(city, goal.screens) : null,
      band: bandSlugs.has(slug), projector: projectorSlugs.has(slug), weather: weatherSlugs.has(slug), page: pages.has(slug),
      terrain: terrain[slug] ?? null, why: terrainIndex && !terrain[slug] ? why[slug] ?? 'profile' : null,
    };
  });
}

/** The planner's courses from this build's files, as the planner page reads them: the list the home form offers. */
export function plannerCourses(): PlanCourse[] {
  return planCourses(optionalInsight<CourseGoal>(COURSE_GOAL_FILE), optionalInsight<PaceBandIndex>(PACE_BAND_INDEX), optionalInsight<TerrainIndex>(TERRAIN_FILE));
}
