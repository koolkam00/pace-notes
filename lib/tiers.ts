/**
 * The tier and link vocabulary (lead decision D16, November 14, 2026): the words a page prints for an edition's
 * verification tier, its split tier and its timing basis, and for a link between a runner's results. This module holds
 * the words and the codes they answer to. components/ui/TierTag.tsx is the only file that draws them, and
 * scripts/verify-tiers.cjs fails any other file under app/, components/ or lib/ that writes one of the phrases, or one
 * of the label classes, by hand. It imports nothing, so a builder's verifier, a card script and a client component can
 * all read it.
 *
 * The codes are the adopted release's own, read from its files on November 14, 2026: tiers and split tiers from the
 * edition table (edition_meta.parquet and EDITION-TIERS.csv, marathon and half), link confidences from the producer's
 * link file and from the identity file's description. `node scripts/verify-tiers.cjs --source=<folders>` recounts them.
 *
 * A code this module does not know is an error where it is asked for, never a silent default, and so is `undefined`
 * (a misspelt field). Check a data file's codes in its builder's verifier with these functions, so no page meets one.
 * No label carries a number or a hue. The words are defined on /methodology: tier, split-tier and timing words at
 * TIER_ANCHOR, link words at LINK_ANCHOR.
 */

/** Where the tier, split-tier and timing words are defined. */
export const TIER_ANCHOR = '/methodology#edition-tiers';
/** Where the link words are defined. */
export const LINK_ANCHOR = '/methodology#link-confidence';

// ---- Verification tiers

/** Every verification tier the release's edition table uses. */
export const EDITION_TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'unverified', 'held_for_review', 'excluded', 'no_rows'] as const;
export type EditionTier = (typeof EDITION_TIERS)[number];

/** Tiers of editions with no result in the release. They are never listed, so they have no words. */
export const NEVER_SHOWN_TIERS = ['excluded', 'no_rows'] as const;
export type ShownTier = Exclude<EditionTier, (typeof NEVER_SHOWN_TIERS)[number]>;

/** The tiers a page can show, in the order a tier line lists them. */
export const SHOWN_TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'unverified', 'held_for_review'] as const satisfies readonly ShownTier[];

/** The words of each tier: sentence case, no number. */
export const TIER_WORDS: Readonly<Record<ShownTier, string>> = {
  stamped: 'Verified',
  stamped_weaker_source: 'Verified, weaker source',
  partial: 'Partial results',
  unverified: 'Unverified',
  held_for_review: 'Held for review',
};

/** The tiers that carry the verified badge (a glyph and the word); every other label is an outlined pill. */
export const BADGE_TIERS = ['stamped', 'stamped_weaker_source'] as const;

const has = (list: readonly string[], code: unknown): code is string => typeof code === 'string' && list.includes(code);
const shown = (code: unknown) => (typeof code === 'string' ? `"${code}"` : String(code));
function unknownCode(kind: string, code: unknown, known: readonly string[]): never {
  throw new Error(`lib/tiers.ts: unknown ${kind} ${shown(code)}. The release uses: ${known.join(', ')}.`);
}
function neverShown(tier: string): never {
  throw new Error(`lib/tiers.ts: the tier "${tier}" is never shown. An edition without results is not listed, so it has no words: leave it out (isShownTier).`);
}

/** True for a tier a page can show, false for `excluded` and `no_rows`; an unknown tier is an error. */
export function isShownTier(tier: string): tier is ShownTier {
  if (!has(EDITION_TIERS, tier)) unknownCode('verification tier', tier, EDITION_TIERS);
  return !has(NEVER_SHOWN_TIERS, tier);
}

/**
 * The words of an edition's tier. `weakerSource` is the release's own flag: give it when the data has it, and an edition
 * whose flag and tier disagree is an error, so "Verified" alone is never printed for a weaker-source stamp.
 */
export function tierWords(tier: string, weakerSource?: boolean | null): string {
  if (!isShownTier(tier)) neverShown(tier);
  if (weakerSource != null && weakerSource !== (tier === 'stamped_weaker_source')) {
    throw new Error(`lib/tiers.ts: the tier "${tier}" comes with weaker_source ${weakerSource}. The release sets the flag on stamped_weaker_source and on no other tier.`);
  }
  return TIER_WORDS[tier];
}

/** Whether a tier carries the verified badge (true for the two stamped tiers). */
export function tierHasBadge(tier: string): boolean {
  if (!isShownTier(tier)) neverShown(tier);
  return has(BADGE_TIERS, tier);
}

// ---- Split tiers

/** Every split tier the release uses. An edition without results has none, and is never shown. */
export const SPLIT_TIERS = ['splits', 'finish_time_only'] as const;
export type SplitTier = (typeof SPLIT_TIERS)[number];

export const FINISH_TIMES_ONLY = 'Finish times only';

/** "Finish times only" for an edition without usable splits; null for one with splits, which says nothing more. */
export function splitTierWords(splitTier: string): string | null {
  if (!has(SPLIT_TIERS, splitTier)) unknownCode('split tier', splitTier, SPLIT_TIERS);
  return splitTier === 'finish_time_only' ? FINISH_TIMES_ONLY : null;
}

// ---- Timing basis

export const GUN_TIMES = 'Gun times';

/** The short code a data file may store for an edition timed gross, in place of the release's own text. */
export const GROSS_TIMING = 'gross';

/**
 * The editions the release times gross: the Berlin half marathon of these years (the release's key: distance `half`,
 * city `Berlin`). They enter no comparison, ranking or record. A builder checks that the editions it marks are these.
 */
export const GUN_TIME_EDITIONS = { distance: 'half', city: 'Berlin', years: [2018, 2019, 2021, 2022, 2023] } as const;

/**
 * Whether a timing basis is gross time. The release writes the basis as free text ("chip", "net if published", …);
 * the text of an edition timed gross starts with the word "gross". null is an edition with no stated basis.
 */
export function isGrossTiming(timingBasis: string | null): boolean {
  if (timingBasis === undefined) throw new Error('lib/tiers.ts: no timing basis was given (undefined). Pass the edition’s timing_basis text, or null where the release states none.');
  return typeof timingBasis === 'string' && /^\s*gross\b/i.test(timingBasis);
}

/** "Gun times" for an edition timed gross; null for every other. */
export const timingWords = (timingBasis: string | null): string | null => (isGrossTiming(timingBasis) ? GUN_TIMES : null);

// ---- Links between a runner's results

/** Every confidence the release's link file gives a link. A result without a link has none (null). */
export const LINK_CONFIDENCES = ['high_elite', 'high', 'medium', 'medium_variant', 'low', 'low_noage', 'low_noage_series', 'low_nosex', 'low_city_pace', 'low_carryover'] as const;
export type LinkConfidence = (typeof LINK_CONFIDENCES)[number];

/** The confidences that can key a runner (decision D4): the usual case, which says nothing more. */
export const KEYED_CONFIDENCES = ['high_elite', 'high', 'medium'] as const;

export const POSSIBLE_MATCH = 'Possible match';
/** The heading of a list of possible matches. */
export const POSSIBLE_MATCHES = 'Possible matches';

/** True for a confidence that can key a runner, false for `medium_variant` and every `low…`; an unknown one is an error. */
export function isKeyedConfidence(confidence: string): boolean {
  if (!has(LINK_CONFIDENCES, confidence)) unknownCode('link confidence', confidence, LINK_CONFIDENCES);
  return has(KEYED_CONFIDENCES, confidence);
}

/**
 * The words of a link: "Possible match", or null where the link says nothing more. `confidence` is the link file's
 * code, or null for a result with no link. `keyed` is whether the identity file gave the result a runner key (its
 * status `keyed`): a link of a keyed confidence whose person fails a screen has none, and reads "Possible match" too.
 * Without `keyed` the confidence alone decides.
 */
export function linkWords(confidence: string | null, { keyed }: { keyed?: boolean } = {}): string | null {
  if (confidence === null) {
    if (keyed) throw new Error('lib/tiers.ts: a result with no link cannot have a runner key.');
    return null;
  }
  if (!isKeyedConfidence(confidence)) {
    if (keyed) throw new Error(`lib/tiers.ts: a link of confidence "${confidence}" never keys a runner.`);
    return POSSIBLE_MATCH;
  }
  return keyed === false ? POSSIBLE_MATCH : null;
}

// ---- Plain text for list rows and sentences

/** Words as they read after a count or inside a line: the first letter lowered ("16 verified", "· possible match"). */
export const inline = (words: string) => words.charAt(0).toLowerCase() + words.slice(1);

/** "1 possible match", "2 possible matches". */
export const possibleMatchCount = (count: number, format: (n: number) => string = String) => `${format(count)} ${inline(count === 1 ? POSSIBLE_MATCH : POSSIBLE_MATCHES)}`;

/** Between the parts of a tier line: a no-break space, a middle dot and a space, as the list rows join their facts. */
export const TIER_LINE_SEPARATOR = ' · ';

/** How many editions of each shown tier a list of editions holds. An unknown or never-shown tier is an error. */
export function countTiers(tiers: Iterable<string>): Partial<Record<ShownTier, number>> {
  const counts: Partial<Record<ShownTier, number>> = {};
  for (const tier of tiers) {
    if (!isShownTier(tier)) neverShown(tier);
    counts[tier] = (counts[tier] ?? 0) + 1;
  }
  return counts;
}

/** A race's editions by tier, in the order of SHOWN_TIERS, tiers without an edition left out: [{ tier, count, words }]. */
export function tierLineParts(counts: Readonly<Record<string, number | undefined>>): { tier: ShownTier; count: number; words: string }[] {
  for (const [tier, count] of Object.entries(counts)) {
    if (count === undefined) continue;
    if (!Number.isInteger(count) || count < 0) throw new Error(`lib/tiers.ts: the count of "${tier}" editions is ${count}, not a whole number of editions.`);
    if (!isShownTier(tier) && count > 0) neverShown(tier);
  }
  const parts = SHOWN_TIERS.filter((tier) => (counts[tier] ?? 0) > 0).map((tier) => ({ tier, count: counts[tier] as number, words: inline(TIER_WORDS[tier]) }));
  if (!parts.length) throw new Error('lib/tiers.ts: a tier line needs at least one edition. A race without results is not listed.');
  return parts;
}

/**
 * A race's tier line as plain text for a list row, from its editions' counts by tier:
 * "6 verified, weaker source · 10 held for review"; one tier for all reads "16 verified".
 */
export function tierLine(counts: Readonly<Record<string, number | undefined>>, format: (n: number) => string = String): string {
  return tierLineParts(counts).map((part) => `${format(part.count)} ${part.words}`).join(TIER_LINE_SEPARATOR);
}

// ---- For verifiers

/** Every phrase of the vocabulary. No other file under app/, components/ or lib/ writes one. */
export const TIER_PHRASES: readonly string[] = [...SHOWN_TIERS.map((tier) => TIER_WORDS[tier]), FINISH_TIMES_ONLY, GUN_TIMES, POSSIBLE_MATCH];

/** The classes components/ui/TierTag.tsx draws with (app/styles/components/badge.css): the badge, the pill, a row's plain tier line and the group. */
export const TIER_CLASSES = ['tier-badge', 'tier-chip', 'tier-line', 'tier-tags'] as const;

/**
 * Matches the class attribute of a tier or link label in rendered HTML, for a verifier that takes the labels out of a
 * page's text before it applies a word rule (as verify-half takes out the scope chip).
 */
export const TIER_LABEL_CLASS = /class="[^"]*\btier-(?:badge|chip|line)\b[^"]*"/;
