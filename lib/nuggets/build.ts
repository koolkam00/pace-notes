/**
 * Building blocks for the nugget files: the builder type the registry holds, a placeholder wrapper and the figure
 * shapes most nuggets use.
 */
import { pct, spokenPct } from './format';
import type { Nugget, NuggetContext, NuggetFigure } from './types';

/** A nugget builder: reads the verified data and returns the nugget. Called once per build (index.ts memoizes it). */
export type Builder = (ctx?: NuggetContext) => Nugget;

/** Marks a nugget as WP0-C's bootstrap entry: its area package replaces it and adds the recount (spec section 5). */
export function placeholder(nugget: Omit<Nugget, 'placeholder'>): Nugget {
  return { ...nugget, placeholder: true };
}

/** A share's figure: "47" with the unit "%", spoken "47 percent". Null when the share is not a number. */
export function shareFigure(share: number, digits = 0): NuggetFigure | null {
  if (!Number.isFinite(share)) return null;
  return { value: pct(share, digits).replace('%', ''), unit: '%', sr: spokenPct(share, digits) };
}

/** Capitalizes the first letter of a sentence that opens on a helper's words ("about 3 in 10" → "About 3 in 10"). */
export const capitalize = (text: string) => text.replace(/^[a-z]/, (c) => c.toUpperCase());
