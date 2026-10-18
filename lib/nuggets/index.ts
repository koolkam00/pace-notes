/**
 * The nugget registry (the redesign spec, section 5): `getNugget(id, ctx?)` and `nuggetsFor(path)`. Server only, at
 * build time. Each area file exports its builders; this file joins them, memoizes each nugget once per build and names
 * the reading of every page in the chapter flow (section 2.2), the ids lib/chapters.ts uses.
 */
import { ANALYSIS_NUGGETS } from './analyses';
import { COURSE_CONTEXT_NUGGETS, COURSE_NUGGETS } from './courses';
import { HOME_NUGGETS } from './home';
import { RUNNER_NUGGETS } from './runners';
import { STORY_NUGGETS } from './stories';
import { TOOL_NUGGETS } from './tools';
import type { Builder } from './build';
import type { Nugget, NuggetContext, NuggetFigure, NuggetId } from './types';

export * from './types';
export { finishesM, plain, sentenceOf, siteTotals, textFor } from './core';

const REGISTRY: Record<string, Builder> = {};
for (const group of [HOME_NUGGETS, STORY_NUGGETS, ANALYSIS_NUGGETS, COURSE_NUGGETS, TOOL_NUGGETS, RUNNER_NUGGETS]) {
  for (const [id, build] of Object.entries(group)) {
    if (REGISTRY[id]) throw new Error(`Nugget ${id} is registered twice.`);
    REGISTRY[id] = build;
  }
}

/** Every registered nugget id. */
export const NUGGET_IDS = Object.keys(REGISTRY) as NuggetId[];

/** Nuggets that need a context to build (a course page's city), with the contexts the site builds them for. */
export const CONTEXT_NUGGETS: readonly NuggetId[] = [...COURSE_CONTEXT_NUGGETS];

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

/**
 * A page's reading as the shell draws it (lib/chapters.ts `ReadingOf`): the nugget's figure and key, or null when it has
 * no figure. Pages pass it to ChapterEnd and ChapterList, so next cards and contents rows show the same number the
 * page leads with.
 */
export function readingOf(id: NuggetId): (NuggetFigure & { key?: string }) | null {
  const { figure, key } = getNugget(id);
  return figure ? { ...figure, key } : null;
}

/**
 * readingOf for a next card: a placeholder nugget (one an area package has yet to replace) shows no figure, so a card
 * never reads "28 course pages" as if it were a finding. Contents rows keep readingOf.
 */
export function settledReadingOf(id: NuggetId): (NuggetFigure & { key?: string }) | null {
  return getNugget(id).placeholder ? null : readingOf(id);
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
  '/analyses/downhill-start': 'downhill.opening',
  '/stories/pacing-types': 'types.top',
  '/analyses/pacing-pattern': 'pattern.profile',
  '/analyses/checkpoint': 'checkpoint.under',
  '/stories/places': 'places.gap',
  '/tools/projector': 'projector.range',
  '/slowdown': 'slowdown.onset',
  '/stories/final-kick': 'kick.twins',
  '/analyses/where-time-is-gained': 'sections.split',
  '/stories/round-numbers': 'round.top',
  '/analyses/finish-time-context': 'target.context',
  '/stories/who-holds-pace': 'holds.gender',
  '/analyses/age-and-pacing': 'age.retention',
  '/stories/courses': 'courses.named',
  '/analyses/course-comparison': 'courses.compare',
  '/analyses/hills-and-pacing': 'terrain.climb',
  '/courses': 'courses.index',
  '/stories/race-morning': 'weather.pairs',
  '/analyses/race-day-weather': 'weather.start',
  '/tools/weather-match': 'weathermatch.mornings',
  '/runners': 'runner.yours',
  '/tools/split-check': 'splitcheck.mats',
  '/analyses/finding-improvement': 'gains.final',
  '/tools/plan': 'plan.goal',
};

/** Each chapter's contents-row reading, chapters 01 to 11 in order (spec section 2.2: the lead and its key). */
export const CHAPTER_LEAD: readonly NuggetId[] = [
  'field.median', 'kick.bank', 'types.top', 'checkpoint.under', 'slowdown.onset', 'finish.busiest',
  'holds.gender', 'courses.named', 'weather.pairs', 'splitcheck.mats', 'kick.recurrence',
];

/** Ids still served by WP0-C's bootstrap placeholders (scripts/verify-nuggets.cjs lists them; WP9 fails while any remain). */
export function placeholderIds(): NuggetId[] {
  return NUGGET_IDS.filter((id) => !CONTEXT_NUGGETS.includes(id) && getNugget(id).placeholder).concat(CONTEXT_NUGGETS.filter((id) => REGISTRY[id] && getNugget(id, { city: '' }).placeholder));
}
