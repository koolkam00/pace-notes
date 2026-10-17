/**
 * Nuggets for /courses and the course pages (owned by WP5 from here; the redesign spec, section 5). Course-level
 * numbers on these pages come from courses.json, so a dot on the index matches its course page (section 3.10).
 *
 * WP0-C's bootstrap: both entries are placeholders without a recount; WP5 replaces them.
 */
import { readInsight } from '@/lib/insights-server';
import type { Courses } from '@/lib/insights';
import { courseSlug } from '@/lib/tools/links';
import { count, countWord, pct } from './format';
import { capitalize, placeholder, shareFigure, type Builder } from './build';
import type { Nugget, NuggetContext } from './types';

function coursesIndex(): Nugget {
  const data = readInsight<Courses>('courses.json');
  const n = data.courses.length;
  return placeholder({
    id: 'courses.index', page: '/courses', denominator: 'course', values: { courses: n }, guard: true,
    headline: `${capitalize(countWord(n))} courses, each with its own shape.`,
    fallback: `${count(n)} courses.`, figure: { value: count(n), sr: `${count(n)} courses` }, key: 'course pages',
  });
}

/** A course page's reading: the share of its finishes with a sustained slowdown. Needs `ctx.city`. */
function courseSlowdown(ctx?: NuggetContext): Nugget {
  const course = readInsight<Courses>('courses.json').courses.find((c) => c.city === ctx?.city);
  const share = course?.slowdown ?? NaN;
  const city = course?.city ?? ctx?.city ?? 'This course';
  return placeholder({
    id: 'course.slowdown', page: `/courses/${courseSlug(city)}`, denominator: 'course', term: '/methodology#sustained-slowdown',
    values: { city, share, finishes: course?.finishes ?? NaN, editions: course?.editions ?? NaN }, guard: Number.isFinite(share),
    headline: `In ${city}, *${pct(share)}* of finishes had a sustained slowdown.`,
    fallback: `${city}: finishes, edition by edition.`,
    figure: shareFigure(share), key: 'of finishes had a sustained slowdown',
  });
}

export const COURSE_NUGGETS: Record<string, Builder> = {
  'courses.index': coursesIndex,
  'course.slowdown': courseSlowdown,
};
