/**
 * Nuggets for the tools and the runner pages (owned by WP4 and WP6 from here; the redesign spec, section 5). A tool's
 * reading is a plain calculation from the visitor's own inputs, so most have no data figure: the entries name the page
 * and its line on the contents. Each is a placeholder its package replaces.
 */
import { placeholder, type Builder } from './build';
import type { NuggetId } from './types';

const tool = (id: NuggetId, page: string, line: string, figure: { value: string; sr: string } | null = null, key?: string): Builder => () =>
  placeholder({ id, page, denominator: 'tool', values: {}, guard: true, headline: line, fallback: line, figure, key });

export const TOOL_NUGGETS: Record<string, Builder> = {
  'splitcheck.mats': tool('splitcheck.mats', '/tools/split-check', 'Check your splits against finishes like yours.'),
  'projector.range': tool('projector.range', '/tools/projector', 'From a checkpoint time, the finishes that followed.'),
  'weathermatch.mornings': tool('weathermatch.mornings', '/tools/weather-match', 'Race-morning weather, matched to past editions.'),
  'plan.goal': tool('plan.goal', '/tools/plan', 'Plan your race: a course, a goal and a pace band.'),
};
