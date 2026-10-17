/**
 * The nugget registry (the redesign spec, section 5): `getNugget(id, ctx?)` and `nuggetsFor(path)`. Server only, at
 * build time. Each area file exports its builders; this file joins them, memoizes each nugget once per build and names
 * the reading of every page in the chapter flow (section 2.2), the ids lib/chapters.ts uses.
 */
import { ANALYSIS_NUGGETS } from './analyses';
import { COURSE_NUGGETS } from './courses';
import { HOME_NUGGETS } from './home';
import { STORY_NUGGETS } from './stories';
import { TOOL_NUGGETS } from './tools';
import type { Builder } from './build';
import type { Nugget, NuggetContext, NuggetId } from './types';

export * from './types';
export { finishesM, plain, sentenceOf, siteTotals, textFor } from './core';

const REGISTRY: Record<string, Builder> = {};
for (const group of [HOME_NUGGETS, STORY_NUGGETS, ANALYSIS_NUGGETS, COURSE_NUGGETS, TOOL_NUGGETS]) {
  for (const [id, build] of Object.entries(group)) {
    if (REGISTRY[id]) throw new Error(`Nugget ${id} is registered twice.`);
    REGISTRY[id] = build;
  }
}

/** Every registered nugget id. */
export const NUGGET_IDS = Object.keys(REGISTRY) as NuggetId[];

/** Nuggets that need a context to build (a course page's city), with the contexts the site builds them for. */
export const CONTEXT_NUGGETS: readonly NuggetId[] = ['course.slowdown'];

const memo = new Map<string, Nugget>();

/** The nugget with this id (and context). Throws on an unknown id, or when a builder returns another id. */
export function getNugget(id: NuggetId, ctx?: NuggetContext): Nugget {
  const key = ctx?.city ? `${id}|${ctx.city}` : id;
  const hit = memo.get(key);
  if (hit) return hit;
  const build = REGISTRY[id];
  if (!build) throw new Error(`Unknown nugget ${id}.`);
  const nugget = build(ctx);
  if (nugget.id !== id) throw new Error(`Nugget builder for ${id} returned ${nugget.id}.`);
  memo.set(key, nugget);
  return nugget;
}

/** Every context-free nugget whose page (without its anchor) is `path`, in registry order. */
export function nuggetsFor(path: string): Nugget[] {
  const clean = path.split('#')[0].replace(/\/$/, '') || '/';
  return NUGGET_IDS.filter((id) => !CONTEXT_NUGGETS.includes(id)).map((id) => getNugget(id)).filter((n) => (n.page.split('#')[0].replace(/\/$/, '') || '/') === clean);
}

/**
 * The reading of each page in the chapter flow (spec section 2.2): the nugget a contents sub-row and a next card show.
 * Course pages take `course.slowdown` with their city; /report has no reading of its own.
 */
export const PAGE_NUGGET: Readonly<Record<string, NuggetId>> = {
  '/': 'site.totals',
  '/finish-times': 'field.median',
  '/stories/race-replay': 'replay.first',
  '/analyses/starting-pace': 'kick.bank',
  '/analyses/downhill-start': 'downhill.start',
  '/stories/pacing-types': 'types.mix',
  '/analyses/pacing-pattern': 'pattern.slowest',
  '/analyses/checkpoint': 'checkpoint.even30',
  '/stories/places': 'places.passed',
  '/tools/projector': 'tool.projector',
  '/slowdown': 'slowdown.late',
  '/stories/final-kick': 'kick.final',
  '/analyses/where-time-is-gained': 'sections.gap',
  '/stories/round-numbers': 'round.top',
  '/analyses/finish-time-context': 'ambition.under',
  '/stories/who-holds-pace': 'demo.slowdown',
  '/analyses/age-and-pacing': 'age.range',
  '/stories/courses': 'courses.fingerprint',
  '/analyses/course-comparison': 'courses.spread',
  '/analyses/hills-and-pacing': 'terrain.grade',
  '/courses': 'courses.index',
  '/stories/race-morning': 'weather.pairs',
  '/analyses/race-day-weather': 'weather.bands',
  '/tools/weather-match': 'tool.weather-match',
  '/runners': 'runner.yours',
  '/tools/split-check': 'tool.split-check',
  '/analyses/finding-improvement': 'gains.minutes',
  '/tools/plan': 'tool.plan',
};

/** Each chapter's contents-row reading, chapters 01 to 11 in order (spec section 2.2: the lead and its key). */
export const CHAPTER_LEAD: readonly NuggetId[] = [
  'field.median', 'kick.bank', 'shape.negsplit', 'checkpoint.even30', 'slowdown.late', 'finish.peak',
  'demo.slowdown', 'courses.spread', 'weather.pairs', 'runner.yours', 'kick.recurrence',
];

/** Ids still served by WP0-C's bootstrap placeholders (scripts/verify-nuggets.cjs lists them; WP9 fails while any remain). */
export function placeholderIds(): NuggetId[] {
  return NUGGET_IDS.filter((id) => !CONTEXT_NUGGETS.includes(id) && getNugget(id).placeholder).concat(CONTEXT_NUGGETS.filter((id) => REGISTRY[id] && getNugget(id, { city: '' }).placeholder));
}
