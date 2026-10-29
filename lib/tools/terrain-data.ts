/**
 * The terrain splits' data (tools/course-terrain.json, built by analysis/build_course_terrain.py): for each course with a
 * checked route profile, the share of the goal reached at every whole km, every whole mile and halfway, at an even effort
 * over its corrected profile with one published grade curve; and why every other course is at even pace. No finish data
 * enters it. The pages read it at build time (manifest-checked) and hand the browser only what the band draws
 * (terrainProps): the route itself, the model input, stays on the server.
 */

export const TERRAIN_FILE = 'tools/course-terrain.json';

/** A curated structure on the route (a bridge deck), on the official axis (km from the start of a 42.195 km race). */
export interface TerrainFeature { id: string; name: string; short: string; from_km: number; to_km: number }

/**
 * One terrain course as the band uses it: `km[k − 1]` is the share of the goal reached at k km (1…42), `mi[m − 1]` at m
 * miles (1…26), `half` at 21.0975 km; the finish is the whole goal.
 */
export interface TerrainCourse { slug: string; city: string; race: string; km: number[]; mi: number[]; half: number; features: TerrainFeature[] }

/** Why a course has no terrain splits: its corrected profile did not pass its check (`held`), or it has no checked profile (`profile`). */
export type NoTerrainWhy = 'held' | 'profile';

/** The corrected, smoothed profile every `step_km` from the start (metres), for the back of the printed band. */
export interface TerrainStrip { step_km: number; m: number[]; min: number; max: number; gain: number; loss: number }

/** The grade curve and pipeline constants the file was built with. */
export interface TerrainModel {
  name: string; a1: number; a2: number; clamp_pct: [number, number]; grid_points: number; median_samples: number;
  sigma_samples: number; kernel_half_width: number; edges: string; grade: string; weights: string;
}

/** A source of a course's profile, with its licence. */
export interface TerrainSource { dataset: string; url: string; licence: string; licence_url?: string; licence_checked?: string; licence_terms?: string; retrieved: string }

/** The published file. */
export interface TerrainIndex {
  family: 'tool-course-terrain'; schema_version: number; release_tag: string; input_as_of: string;
  context_manifest_sha256: string; course_profiles_sha256: string; corrections_version: string; corrections_sha256: string;
  scripts: Record<string, string>;
  model: TerrainModel;
  courses: (TerrainCourse & {
    class: string; route_km: number; route: unknown; strip: TerrainStrip; max_grade_pct: number; smoothed_gain_m: number;
    sources: TerrainSource[]; flags: string[];
  })[];
  even: { slug: string; city: string; why: NoTerrainWhy }[];
}

/**
 * Compact props for the client: each terrain course without its route or strip (`terrain`, by slug), every other
 * course's reason (`why`, by slug) and, with `withStrip`, each terrain course's strip (`strips`, by slug). An absent
 * file gives empty maps, so every course is at even pace.
 */
export function terrainProps(index: TerrainIndex | null, withStrip = false): {
  terrain: Record<string, TerrainCourse>; why: Record<string, NoTerrainWhy>; strips?: Record<string, TerrainStrip>;
} {
  const terrain: Record<string, TerrainCourse> = {};
  const strips: Record<string, TerrainStrip> = {};
  for (const c of index?.courses ?? []) {
    terrain[c.slug] = { slug: c.slug, city: c.city, race: c.race, km: c.km, mi: c.mi, half: c.half, features: c.features };
    if (withStrip) strips[c.slug] = c.strip;
  }
  const why: Record<string, NoTerrainWhy> = {};
  for (const e of index?.even ?? []) why[e.slug] = e.why;
  return withStrip ? { terrain, why, strips } : { terrain, why };
}
