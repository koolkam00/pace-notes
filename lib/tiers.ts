/**
 * The tier and link vocabulary (lead decision D16, November 14, 2026): the words a page prints for an edition's
 * verification tier, its split tier and its timing basis, and for a link between a runner's results. This module holds
 * the words and the codes they answer to. components/ui/TierTag.tsx is the only file that draws them, and
 * scripts/verify-tiers.cjs fails any other file under app/, components/ or lib/ that writes one of the phrases, or one
 * of the label classes, by hand. It imports nothing, so a builder's verifier, a card script and a client component can
 * all read it.
 *
 * The codes are the adopted release's own, read from its files on November 14, 2026: tiers and split tiers from the
 * edition table (edition_meta.parquet and EDITION-TIERS.csv, marathon and half), its timing-basis texts from the same
 * table, link confidences from the producer's link file and the identity file's description, and the reasons a link
 * has no runner key from analysis/build_identity.py. `node scripts/verify-tiers.cjs --source=<folders>` recounts them.
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

/** The classes of a timing basis, as the linked-records contract names them (docs/LINKED_RECORDS.md, "Timing basis"). */
export const TIMING_CLASSES = ['chip', 'chip_fallback', 'gun', 'mixed', 'not_stated'] as const;
export type TimingClass = (typeof TIMING_CLASSES)[number];
/** The one class with words: an edition whose basis the release states as gun or gross time, at either distance. */
export const GUN_TIMING: TimingClass = 'gun';

/**
 * Every timing basis the release states for an edition (the free text of `timing_basis`, marathon and half), by class.
 * `chip`: chip or net time. `chip_fallback`: chip or net time where the source has one, else gun or clock time; also a
 * basis the release states only "if published" or "where published". `gun`: gun or gross time, also where the text puts
 * gun time first and chip time second. `mixed`: gun splits with a net or chip finish. `not_stated`: "as published",
 * "official time" or no value, so the release does not say chip or gun. A text that is not listed here is an error:
 * class it before a page shows the edition. Only client pages that pass the release's text carry this list.
 */
export const TIMING_BASES: Readonly<Record<TimingClass, readonly string[]>> = {
  chip: ['chip', 'chip (Tiempo real)', 'chip (netto) time', 'chip (ot) as published', 'chip time', 'chiptime', 'net (chip) time', 'net (last time column)',
    'net time (PDF says wg czasu netto)', 'net(chip)', 'netto (chip) time', 'netto as published', 'real (chip) time', 'real time as published'],
  chip_fallback: ['chip (clock if no chip)', 'chip (delta_net), clock if no chip', 'chip (gun if no chip)', 'chip (tiempoChip) else gun', 'chip elapsed (gun if no chip)',
    'chip time else gun', 'chip where published, else gun', "net 'time' (gun if none)", 'net (Tempo Liquido) else gun', 'netto if published else bruto',
    'realTime (net) as published, else officialTime', 'chip (realTime) where published', 'net if published'],
  gun: ['gun', 'gross (gun / Brutto; the source net column was not loaded)', 'gun (official, matches organiser winners) else chip'],
  mixed: ['mixed'],
  not_stated: ['as published', 'as published (Czas)', 'as published (Tiempo)', 'as published (Time)', 'final time as published', 'official time', 'time', 'unknown'],
};

/**
 * The class of an edition's timing basis. `timingBasis` is the release's `timing_basis` text, or one of TIMING_CLASSES
 * (a data file may store the class in place of the text), or null where the release states none.
 */
export function timingClass(timingBasis: string | null): TimingClass {
  if (timingBasis === null) return 'not_stated';
  if (has(TIMING_CLASSES, timingBasis)) return timingBasis as TimingClass;
  for (const cls of TIMING_CLASSES) if (has(TIMING_BASES[cls], timingBasis)) return cls;
  if (timingBasis === undefined) throw new Error('lib/tiers.ts: no timing basis was given (undefined). Pass the edition’s timing_basis text, or null where the release states none.');
  throw new Error(`lib/tiers.ts: unknown timing basis ${shown(timingBasis)}. Class the release’s text in TIMING_BASES before a page shows the edition.`);
}

/** Whether a timing class is gun time. It reads no release text, so a page that holds the class stays light. */
export function isGunTiming(cls: string): boolean {
  if (!has(TIMING_CLASSES, cls)) unknownCode('timing class', cls, TIMING_CLASSES);
  return cls === GUN_TIMING;
}

/** "Gun times" for an edition whose basis the release states as gun or gross time; null for every other. */
export const timingWords = (timingBasis: string | null): string | null => (timingClass(timingBasis) === GUN_TIMING ? GUN_TIMES : null);

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

/**
 * The quiet words of each confidence. Every link shows its tier (owner, November 13, 2026: "Show the tier, and don't
 * present low-confidence links as certain"): plain text beside the result, never a pill.
 */
export const LINK_TIER_WORDS: Readonly<Record<LinkConfidence, string>> = {
  high_elite: 'High, elite',
  high: 'High',
  medium: 'Medium',
  medium_variant: 'Medium, name variant',
  low: 'Low',
  low_noage: 'Low, no age',
  low_noage_series: 'Low, no age, same series',
  low_nosex: 'Low, no recorded sex',
  low_city_pace: 'Low, city and pace',
  low_carryover: 'Low, carried over',
};

/** The quiet words of a link's confidence; null for a result with no link. */
export function linkTierWords(confidence: string | null): string | null {
  if (confidence === null) return null;
  isKeyedConfidence(confidence);
  return LINK_TIER_WORDS[confidence as LinkConfidence];
}

/** Why a result has no runner key: the identity file's `not_keyed_reason` codes, in the order it applies them. */
export const NOT_KEYED_REASONS = ['left_out_by_row_rule', 'unlinked', 'tier_below_medium', 'sex_conflict', 'birth_year_spread', 'two_results_in_one_edition'] as const;

/** The three screens that leave a link of a keyed confidence without a runner key, in words. */
export const SCREEN_WORDS = {
  sex_conflict: 'recorded sexes differ',
  birth_year_spread: 'recorded ages differ',
  two_results_in_one_edition: 'two results in one edition',
} as const;

/**
 * The words of the reason a link has no runner key: one of the three screens. null for `tier_below_medium` (the
 * confidence says it already) and for `unlinked` (no link). A result left out by the row rule is never shown, so asking
 * for its words is an error.
 */
export function notKeyedWords(reason: string): string | null {
  if (!has(NOT_KEYED_REASONS, reason)) unknownCode('not-keyed reason', reason, NOT_KEYED_REASONS);
  if (reason === 'left_out_by_row_rule') throw new Error('lib/tiers.ts: a result left out by the row rule is never shown, so its reason has no words.');
  return reason in SCREEN_WORDS ? SCREEN_WORDS[reason as keyof typeof SCREEN_WORDS] : null;
}

/**
 * The quiet text of a link: its confidence and, for a link of a keyed confidence that has no runner key, the screen
 * that left it without one ("High · recorded ages differ"). `keyed` and `reason` are the identity file's status and
 * `not_keyed_reason`; a reason alone says the link is not keyed. null for a result with no link.
 */
export function linkQuietWords(confidence: string | null, { keyed, reason }: { keyed?: boolean; reason?: string | null } = {}): string | null {
  linkWords(confidence, { keyed });
  const why = reason == null ? null : notKeyedWords(reason);
  if (confidence === null) {
    if (reason != null && reason !== 'unlinked') throw new Error(`lib/tiers.ts: a result with no link cannot have the reason "${reason}".`);
    return null;
  }
  const words = LINK_TIER_WORDS[confidence as LinkConfidence];
  if (keyed && reason != null) throw new Error(`lib/tiers.ts: a keyed link has no not-keyed reason (got "${reason}").`);
  if (!isKeyedConfidence(confidence)) {
    if (reason != null && reason !== 'tier_below_medium') throw new Error(`lib/tiers.ts: a link of confidence "${confidence}" is not keyed because of its tier, not "${reason}".`);
    return words;
  }
  if (why === null) {
    if (reason != null) throw new Error(`lib/tiers.ts: the reason "${reason}" does not fit a link of confidence "${confidence}".`);
    if (keyed === false) throw new Error(`lib/tiers.ts: a link of confidence "${confidence}" without a runner key needs its not_keyed_reason, so the page says why.`);
    return words;
  }
  return `${words}${TIER_LINE_SEPARATOR}${why}`;
}

// ---- Plain text for list rows and sentences

/** Words as they read after a count or inside a line: the first letter lowered ("16 verified", "· possible match"). */
export const inline = (words: string) => words.charAt(0).toLowerCase() + words.slice(1);

/** "1 possible match", "2 possible matches". */
export const possibleMatchCount = (count: number, format: (n: number) => string = String) => `${format(count)} ${inline(count === 1 ? POSSIBLE_MATCH : POSSIBLE_MATCHES)}`;

/** Between the parts of a tier line: a no-break space, a middle dot and a space, as the list rows join their facts. */
export const TIER_LINE_SEPARATOR = '\u00a0· ';

/**
 * A tier's words in a tier line: the first letter lowered, and partial editions read "with partial results", so a count
 * before them is a count of editions ("3 with partial results"). The pill stays "Partial results".
 */
export const tierLineWords = (tier: ShownTier): string => (tier === 'partial' ? `with ${inline(TIER_WORDS.partial)}` : inline(TIER_WORDS[tier]));

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
  const parts = SHOWN_TIERS.filter((tier) => (counts[tier] ?? 0) > 0).map((tier) => ({ tier, count: counts[tier] as number, words: tierLineWords(tier) }));
  if (!parts.length) throw new Error('lib/tiers.ts: a tier line needs at least one edition. A race without results is not listed.');
  return parts;
}

/**
 * A race's tier line as plain text for a list row, from its editions' counts by tier:
 * "6 verified, weaker source · 10 held for review"; one tier for all reads "16 verified"; partial editions read
 * "3 with partial results".
 */
export function tierLine(counts: Readonly<Record<string, number | undefined>>, format: (n: number) => string = String): string {
  return tierLineParts(counts).map((part) => `${format(part.count)} ${part.words}`).join(TIER_LINE_SEPARATOR);
}

// ---- For verifiers

/** Every phrase of the vocabulary. No other file under app/, components/ or lib/ writes one. */
export const TIER_PHRASES: readonly string[] = [...SHOWN_TIERS.map((tier) => TIER_WORDS[tier]), FINISH_TIMES_ONLY, GUN_TIMES, POSSIBLE_MATCH];

/**
 * The link words no other file writes either: the quiet words of two or more parts ("High, elite", "Low, no age", …)
 * and the screens' words. "High", "Medium" and "Low" alone are ordinary words and are not held.
 */
export const LINK_PHRASES: readonly string[] = [...LINK_CONFIDENCES.map((confidence) => LINK_TIER_WORDS[confidence]).filter((words) => words.includes(',')), ...Object.values(SCREEN_WORDS)];

/**
 * The classes components/ui/TierTag.tsx draws with (app/styles/components/badge.css): the badge, the pill, a row's plain
 * tier line, the quiet text of a link's confidence and the group.
 */
export const TIER_CLASSES = ['tier-badge', 'tier-chip', 'tier-line', 'tier-quiet', 'tier-tags'] as const;

/**
 * Matches the class attribute of a tier or link label in rendered HTML, for a verifier that takes the labels out of a
 * page's text before it applies a word rule (as verify-half takes out the scope chip).
 */
export const TIER_LABEL_CLASS = /class="[^"]*\btier-(?:badge|chip|line|quiet)\b[^"]*"/;
