import PaceBand, { type RouteProfile, type UnpublishedCourse } from '@/components/tools/PaceBand';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import type { CourseGeometry } from '@/lib/insights';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { PaceBandIndex } from '@/lib/tools/data';
import { courseSlug } from '@/lib/tools/links';

export const metadata = pageMetadata({
  title: 'Printable Marathon Pace Band for Any Goal | Pace Notes',
  description: 'Print a free even-pace marathon wristband for any goal time, by mile, km or 5 km mat, beside what finishes at that goal ran at each mat on your course.',
  path: '/tools/pace-band',
});

const INDEX = 'tools/pace-band.json';

/** Read one optional insight file; null when it is not in this build or cannot be read. */
function optional<T>(name: string): T | null {
  try {
    return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
  } catch {
    return null;
  }
}

/**
 * Courses that other Pace Notes data knows but the pace band does not publish (for example Prague, which the course
 * stories list but whose editions all fall to the start-offset screen), so a link naming one says so instead of "not found".
 */
function unpublishedCourses(index: PaceBandIndex): Record<string, UnpublishedCourse> {
  const published = new Set(index.scopes.map((s) => s.slug));
  const cities = new Set<string>();
  for (const c of optional<{ courses: { city: string }[] }>('courses.json')?.courses ?? []) cities.add(c.city);
  for (const e of optional<{ editions: { city: string }[] }>('tools/weather-match.json')?.editions ?? []) cities.add(e.city);
  for (const c of optional<{ courses: { city: string }[] }>('course-geometry.json')?.courses ?? []) cities.add(c.city);
  const out: Record<string, UnpublishedCourse> = {};
  for (const city of [...cities].sort()) {
    const slug = courseSlug(city);
    if (!slug || published.has(slug) || out[slug]) continue;
    out[slug] = { city, note: `No goal in ${city} has enough finishes for observed columns. The even-pace band still works.` };
  }
  return out;
}

export default function PaceBandPage() {
  const manifest = getInsightsManifest();
  const indexSha = manifest.files[INDEX]?.sha256 ?? null;
  const index = indexSha ? readInsight<PaceBandIndex>(INDEX) : null;

  // Supplied route elevation for the optional printed back strip. Context only: never used in a calculation.
  const geometry = manifest.files['course-geometry.json'] ? readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses : [];
  const profiles: RouteProfile[] = [];
  for (const scope of index?.scopes ?? []) {
    const course = scope.city ? geometry.find((c) => c.city === scope.city) : undefined;
    if (!course || !course.elevation_m?.length) continue;
    profiles.push({
      slug: scope.slug, city: course.city, race: course.race, km: course.distance_km, step: course.elevation_step_km,
      m: course.elevation_m.map((v) => Math.round(v * 10) / 10), min: course.min_m, max: course.max_m, gain: course.gain_m, loss: course.loss_m,
    });
  }

  // Projector courses, so the race-day link names a course only when the projector publishes it.
  const projectorScopes = optional<{ scopes: { slug: string }[] }>('tools/projector.json')?.scopes.map((s) => s.slug) ?? null;
  const unpublished = index ? unpublishedCourses(index) : {};

  return (
    <div className="tool-page">
      <ToolHeader slug="pace-band" />
      <PaceBand indexSha={indexSha} profiles={profiles} projectorScopes={projectorScopes} unpublished={unpublished} />
      <ToolEnd path="/tools/pace-band" how="/methodology#tools-pace-band" />
    </div>
  );
}
