import type { ResearchAnswer } from './research-data';
import { extensionForQuestion } from './extension-data';
import { getCohortManifest, listedEditions } from './insights-server';

export function slugifyCity(name: string) { return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

/**
 * The 27 courses that had a page before the combined release of November 2026. Their addresses are kept whatever the
 * edition policy leaves them (lead decisions D14 and D15, November 14, 2026): a course with no counted edition keeps a
 * page that lists its editions and states no pooled figure. Each is the race's label, the pipeline's `city`.
 */
export const KEPT_COURSE_PAGES: readonly string[] = ['Amsterdam', 'Auckland', 'Austin', 'Barcelona', 'Berlin', 'Boston', 'Chicago', 'Copenhagen', 'Dubai', 'Eindhoven',
  'Frankfurt', 'Gold Coast', 'Hamburg', 'Helsinki', 'London', 'Madrid', 'New York', 'Oslo', 'Paris', 'Prague', 'Rotterdam', 'Singapore', 'Stockholm', 'Sydney', 'Valencia',
  'Warsaw', 'Washington'];
/** A race gets a course page from three counted editions: the floor of any reading across editions (AGENTS rule 13). */
export const COURSE_PAGE_MIN_EDITIONS = 3;

/**
 * The courses with a page, by race label, sorted: every race with three or more counted editions in the marathon
 * cohort, plus each kept course. Until November 14, 2026 this was every city of the course-profile pack (100 pooled
 * finishes), which under the combined release would have dropped Auckland and Singapore and given a page to a race with
 * one counted edition.
 */
export function getCourseNames(): string[] {
  const counted = new Map<string, number>();
  for (const e of getCohortManifest().manifest.editions) if (e.use === 'counted') counted.set(e.city, (counted.get(e.city) ?? 0) + 1);
  const known = new Set(listedEditions().map((e) => e.city));
  for (const city of KEPT_COURSE_PAGES) if (!known.has(city)) throw new Error(`The kept course page ${city} has no edition in the adopted release.`);
  return [...new Set([...KEPT_COURSE_PAGES, ...[...counted].filter(([, n]) => n >= COURSE_PAGE_MIN_EDITIONS).map(([city]) => city)])].sort();
}

export function getIndividualCourseAnswer(city: string): ResearchAnswer | undefined {
  const pack = extensionForQuestion('s3_course_breaks');
  const spec = pack?.answer.charts[0];
  const rows = spec?.rows.filter(row => row.city === city);
  if (!pack || !spec || !rows?.length) return undefined;
  return {
    id: `course-${slugifyCity(city)}`, title: `How do runners pace ${city}?`, aliases: [],
    ...pack.answer,
    answer: `The ${city} profile shows where runners tend to change pace relative to their own marathon average. Each point is the median of the same complete-record cohort.`,
    detail: 'The profile pools available editions. It does not isolate the effect of hills, weather or route changes.',
    charts: [{ ...spec, title: `Pace through ${city}`, rows, filters: undefined }],
    dataset: { ...pack.answer.dataset!, n: Number(rows[0].n_value) },
  };
}
