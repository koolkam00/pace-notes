import PaceBand, { type RouteProfile, type UnpublishedCourse } from '@/components/tools/PaceBand';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { PaceBandIndex } from '@/lib/tools/data';
import { courseSlug } from '@/lib/tools/links';
import { MARATHON_KM } from '@/lib/tools/pace';
import { TERRAIN_FILE, terrainProps, type TerrainIndex } from '@/lib/tools/terrain-data';

export const metadata = pageMetadata({
  title: 'Printable Marathon Pace Band for Any Goal | Pace Notes',
  description: 'Print a free marathon wristband for any goal time, with your course’s climbs and bridges or at even pace, by mile, km or 5 km mat, beside what finishes at that goal ran.',
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

  // The terrain splits (tools/course-terrain.json): each terrain course's shares and structures, every other course's
  // reason, and for the optional printed back strip the corrected profile the splits were spread over. No other course
  // gets a back strip. Without the file every course is at even pace, with no line.
  const terrainIndex = optional<TerrainIndex>(TERRAIN_FILE);
  const { terrain, why, strips = {} } = terrainProps(terrainIndex, true);
  const profiles: RouteProfile[] = Object.values(terrain).map((t) => {
    const strip = strips[t.slug];
    return { slug: t.slug, city: t.city, race: t.race, km: MARATHON_KM, step: strip.step_km, m: strip.m, min: strip.min, max: strip.max, gain: strip.gain, loss: strip.loss, features: t.features };
  });
  // Every course the pace band publishes, by slug, so a course link names its city before the index loads.
  const cities: Record<string, string> = {};
  for (const scope of index?.scopes ?? []) if (scope.slug !== 'all' && scope.city) cities[scope.slug] = scope.city;

  // Projector courses, so the race-day link names a course only when the projector publishes it.
  const unpublished = index ? unpublishedCourses(index) : {};

  return (
    <div className="tool-page">
      <ToolHeader slug="pace-band" />
      <PaceBand indexSha={indexSha} profiles={profiles} unpublished={unpublished} cities={cities} terrain={terrain} why={terrainIndex ? why : null} how="/methodology#tools-pace-band" />
      <ToolEnd path="/tools/pace-band" how="/methodology#tools-pace-band" numbers />
    </div>
  );
}
