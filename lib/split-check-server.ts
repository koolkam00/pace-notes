/**
 * Build-time inputs of the split check and the race report (server only: it reads files): the starting-pace analysis's
 * six opening groups, the pacing-type cohort, and the courses other Pace Notes data names. The split check page, /report
 * and /runners read them here, so the three show the same groups, cohort and names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getFastStartStart } from './fast-start-server';
import type { Archetypes } from './insights';
import { getInsightsManifest, readInsight } from './insights-server';
import type { OpeningBand, ReportData, TypeCohort } from './report';
import type { PaceBandIndex } from './tools/data';
import { courseSlug } from './tools/links';
import { PACE_BAND_INDEX } from './tools/pace-band-data';

export const ARCHETYPES = 'archetypes.json';

/** The six opening groups of the starting-pace analysis (definitions only), and its course names for deep links. */
export function openingGroups(): { bands: OpeningBand[]; cities: string[] } {
  try {
    const start = getFastStartStart('all');
    const bands = (start.bands as unknown as OpeningBand[]).filter((b) => typeof b.id === 'string' && typeof b.label === 'string'
      && (b.lower === null || typeof b.lower === 'number') && (b.upper === null || typeof b.upper === 'number'));
    return bands.length === start.bands.length
      ? { bands: bands.map(({ id, label, lower, upper, lower_inclusive, upper_inclusive }) => ({ id, label, lower, upper, lower_inclusive: Boolean(lower_inclusive), upper_inclusive: Boolean(upper_inclusive) })), cities: start.cities }
      : { bands: [], cities: [] };
  } catch {
    return { bands: [], cities: [] };
  }
}

function optional<T>(name: string): T | null {
  try {
    return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
  } catch {
    return null;
  }
}

/** The pace band index (the split check's comparison), when it is in this build. */
export const paceBandIndex = () => optional<PaceBandIndex>(PACE_BAND_INDEX);

/**
 * Courses that other Pace Notes data knows (runner records, courses, weather, route geometry) but the split check does not
 * compare with, by slug. A runner-page link to a Prague race then says so plainly instead of reporting an unknown course.
 */
export function otherCourses(index: PaceBandIndex | null): Record<string, string> {
  if (!index) return {};
  const published = new Set(index.scopes.map((s) => s.slug));
  const cities = new Set<string>();
  try {
    const runners = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/runners/manifest.json')).toString()) as { editions?: { city: string }[] };
    for (const e of runners.editions ?? []) cities.add(e.city);
  } catch { /* runner records are optional here */ }
  for (const c of optional<{ courses: { city: string }[] }>('courses.json')?.courses ?? []) cities.add(c.city);
  for (const e of optional<{ editions: { city: string }[] }>('tools/weather-match.json')?.editions ?? []) cities.add(e.city);
  for (const c of optional<{ courses: { city: string }[] }>('course-geometry.json')?.courses ?? []) cities.add(c.city);
  const out: Record<string, string> = {};
  for (const city of [...cities].sort()) {
    const slug = courseSlug(city);
    if (slug && !published.has(slug) && !out[slug]) out[slug] = city;
  }
  return out;
}

/**
 * The pacing types are fitted on the story cohort, which keeps the editions the tool cohort drops for a shifted mat grid.
 * Its finishes are in archetypes.json; its editions are the tool's plus those, checked here by the finish count.
 */
export function typeCohort(index: PaceBandIndex | null): TypeCohort | null {
  const types = optional<Archetypes>(ARCHETYPES);
  if (!types) return null;
  const grid = index?.screens?.grid ?? [];
  const sameOffsets = index ? JSON.stringify((index.screens?.start_offset ?? []).map((o) => `${o.city} ${o.year}`).sort())
    === JSON.stringify(types.start_offset_editions.map((o) => `${o.city} ${o.year}`).sort()) : false;
  const matches = index !== null && sameOffsets && types.cohort_n === index.cohort_n + grid.reduce((sum, g) => sum + (g.finishes ?? Number.NaN), 0);
  return {
    n: types.cohort_n,
    editions: matches && index ? index.editions + grid.length : null,
    keeps: matches ? grid.map((g) => `${g.city} ${g.year}`) : [],
  };
}

/** What the race report needs from the build, for /report and the runner view: hashes, groups, cohort and course names. */
export function reportData(): ReportData {
  const manifest = getInsightsManifest();
  const index = paceBandIndex();
  const named = Object.fromEntries((index?.scopes ?? []).flatMap((s) => (s.slug !== 'all' && s.city ? [[s.slug, s.city]] : [])));
  return {
    indexSha: manifest.files[PACE_BAND_INDEX]?.sha256 ?? null,
    archetypesSha: manifest.files[ARCHETYPES]?.sha256 ?? null,
    openingBands: openingGroups().bands,
    typeCohort: typeCohort(index),
    courses: { ...otherCourses(index), ...named },
  };
}
