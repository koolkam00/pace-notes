/**
 * The nugget contract (the redesign spec, section 5). Every headline number and every directional word on the site comes
 * from a nugget: raw values read from the verified data files, a guard for the direction or size the headline asserts,
 * the headline when the guard holds and a neutral fallback when it does not. Pages render `sentenceOf(nugget)`; they
 * never type a number.
 *
 * A headline holds at most one *…* span (the italic accent on the number or the comparison), which Reading renders as
 * <em>. A headline that contains a pace, distance or temperature is units-aware: it carries both strings.
 */
export type NuggetId = `${string}.${string}`;

export type UnitsAware<T> = { mi: T; km: T };
/** A sentence, or one per unit mode when it names a pace, a distance or a temperature. */
export type NuggetText = string | UnitsAware<string>;

export type NuggetFigure = {
  /** Already formatted ("4:10", "47%", "1.73"); the unit goes in `unit`. */
  value: string;
  unit?: string;
  /** The full spoken value ("4 hours 10 minutes", "47 percent"). */
  sr: string;
  /**
   * The number alone, as a screen reader hears it right before the key ("5 minutes 6 seconds", where `sr` says "5 minutes
   * 6 seconds behind" for a figure read on its own): the guide, the contents and the next cards follow the figure with
   * its key, so a word the key opens on is never said twice ("behind behind"). Defaults to `sr`.
   */
  spoken?: string;
};

/**
 * The count family a sentence uses. `half`: half finishes in verified results (/half, the half pace chart's panel).
 * `linked`: pairs of half and marathon records linked by name (the half story, the predictor's half panel, the goal
 * pages' half line). The half families never share a surface with a marathon family.
 */
export type Denominator = 'eligible' | 'story' | 'shape' | 'kick' | 'demographics' | 'positions' | 'course' | 'tool' | 'half' | 'linked' | 'none';

export type Nugget<V extends Record<string, number | string> = Record<string, number | string>> = {
  id: NuggetId;
  /** Where the nugget leads: a path, with the beat's anchor when it is not the page's opener. */
  page: string;
  /** Raw values: seconds, shares from 0 to 1, counts, labels. Never pre-formatted. */
  values: V;
  /** The direction or threshold the headline asserts, computed from `values`. */
  guard: boolean;
  /** The sentence when the guard holds (one *…* accent at most). */
  headline: NuggetText;
  /** The neutral sentence when the guard fails: it never asserts a direction or a size. */
  fallback: NuggetText;
  /** The reading's figure, or null for a page with no data value (a tool, "Yours"). */
  figure: NuggetFigure | null;
  /** The figure in kilometres, when it names a distance, a height or a temperature (the figure is the miles version). */
  figureKm?: NuggetFigure;
  /** The short key under the figure on a contents row (the approved wording in the spec, section 2.2). */
  key?: string;
  /** The /methodology anchor of the term the sentence uses, linked once per page. */
  term?: `/methodology#${string}`;
  /** The count family the sentence uses; one surface uses one family. */
  denominator: Denominator;
  /**
   * True while the entry only wraps the page's existing data-built sentence (WP0-C's bootstrap). The area package that
   * owns the page replaces it with a real nugget and its recount in scripts/verify-nuggets.cjs; WP9 fails while any
   * placeholder remains.
   */
  placeholder?: true;
};

/** Options a page passes when a nugget depends on its context (a course page's city). */
export type NuggetContext = { city?: string };
