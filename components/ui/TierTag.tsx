import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { GUN_TIMES, LINK_ANCHOR, TIER_ANCHOR, isGunTiming, linkQuietWords, linkWords, splitTierWords, tierHasBadge, tierLine, tierWords, timingWords } from '@/lib/tiers';

// The tier and link labels (lead decision D16, November 14, 2026) are drawn here and nowhere else. Their words, and the
// release's codes they answer to, are lib/tiers.ts; their look is app/styles/components/badge.css. A module of its own,
// apart from the evidence badges (components/tools/EvidenceTag.tsx), so a page carries only the labels it shows.
//
// No client script: no state, effect or handler, so each label renders in a server page and in a client component
// alike. Every label has two modes. `link` (the default) is a link to the word's definition on /methodology with a
// 44 px hit area; `link={false}` is a bare label, for a row, card or checkbox label that is itself a control (a link
// holds no link). A label never carries a number or a hue. A code the vocabulary does not know stops the render.
//
// A client component that shows labels imports only what it draws. `TimingTag` and `EditionTags` read the release's
// timing-basis text and so carry the list of every such text (lib/tiers.ts TIMING_BASES); a client page that holds the
// timing class uses `TimingClassTag` inside a `TagGroup` instead, and that list stays out of its script.

type Look = { link?: boolean; className?: string };
type Data = Record<`data-${string}`, string>;

function Label({ form, href, link, className, data, children }: { form: 'tier-badge' | 'tier-chip'; href: string; link: boolean; className?: string; data: Data; children: ReactNode }) {
  const cls = className ? `${form} ${className}` : form;
  return link ? <Link href={href} className={cls} {...data}>{children}</Link> : <span className={cls} {...data}>{children}</span>;
}

/**
 * An edition's verification tier. "Verified" and "Verified, weaker source" are the badge (a tick and the words, drawn
 * as the evidence badge is); "Partial results", "Unverified" and "Held for review" are outlined pills, drawn as the
 * scope chip is. Pass the release's `weaker_source` flag where the data has it: a flag that disagrees with the tier
 * stops the render. `excluded` and `no_rows` editions are never shown and stop it too.
 */
export function TierTag({ tier, weakerSource, link = true, className }: { tier: string; weakerSource?: boolean | null } & Look) {
  const words = tierWords(tier, weakerSource);
  return <Label form={tierHasBadge(tier) ? 'tier-badge' : 'tier-chip'} href={TIER_ANCHOR} link={link} className={className} data={{ 'data-tier': tier }}>{words}</Label>;
}

/** "Finish times only", beside the tier of an edition without usable splits; nothing for an edition with splits. */
export function SplitTierTag({ splitTier, link = true, className }: { splitTier: string } & Look) {
  const words = splitTierWords(splitTier);
  return words ? <Label form="tier-chip" href={TIER_ANCHOR} link={link} className={className} data={{ 'data-split-tier': splitTier }}>{words}</Label> : null;
}

/**
 * "Gun times", on an edition whose timing basis the release states as gun or gross time, at either distance; nothing
 * for every other. `timingBasis` is the release's `timing_basis` text, or a timing class where the data file stores
 * that, or null where the release states none. A text the vocabulary has not classed stops the render.
 */
export function TimingTag({ timingBasis, link = true, className }: { timingBasis: string | null } & Look) {
  const words = timingWords(timingBasis);
  return words ? <Label form="tier-chip" href={TIER_ANCHOR} link={link} className={className} data={{ 'data-timing': 'gun' }}>{words}</Label> : null;
}

/**
 * The same label from a timing class (`chip`, `chip_fallback`, `gun`, `mixed` or `not_stated`): "Gun times" for `gun`,
 * nothing for the others. For a page that holds the class and not the release's text; it reads no list of texts.
 */
export function TimingClassTag({ timing, link = true, className }: { timing: string } & Look) {
  return isGunTiming(timing) ? <Label form="tier-chip" href={TIER_ANCHOR} link={link} className={className} data={{ 'data-timing': 'gun' }}>{GUN_TIMES}</Label> : null;
}

/**
 * The link mark: "Possible match" on a result joined to a runner by a link of confidence `medium_variant` or `low…`,
 * or by any link whose person the identity file left without a runner key (`keyed={false}`); nothing for the usual
 * link and for a result with no link (`confidence={null}`). A possible match is listed apart and enters no figure.
 */
export function LinkMark({ confidence, keyed, link = true, className }: { confidence: string | null; keyed?: boolean } & Look) {
  const words = linkWords(confidence, { keyed });
  return words && confidence ? <Label form="tier-chip" href={LINK_ANCHOR} link={link} className={className} data={{ 'data-link': confidence }}>{words}</Label> : null;
}

/**
 * The quiet text of a link's confidence: "High", "Medium, name variant", "Low, no age". Every link shows its tier
 * (owner, November 13, 2026), as plain words beside the result, never a pill. For a link of a keyed confidence that
 * the identity file left without a runner key, pass its `not_keyed_reason` and the text says why ("High · recorded ages
 * differ"). Nothing for a result with no link.
 */
export function LinkTier({ confidence, keyed, reason, className }: { confidence: string | null; keyed?: boolean; reason?: string | null; className?: string }) {
  const words = linkQuietWords(confidence, { keyed, reason });
  // "High" alone does not say what is high: a screen reader hears what the words describe.
  return words && confidence ? <span className={className ? `tier-quiet ${className}` : 'tier-quiet'} data-link-tier={confidence}><span className="sr-only">Link confidence: </span>{words}</span> : null;
}

/**
 * A link as a page shows it. A keyed link prints its quiet words and no pill. A link that is not keyed prints the
 * "Possible match" pill and its quiet words: the confidence, and for a keyed confidence the reason it has no runner
 * key (`reason` is then required). `link` is the pill's mode; the quiet words are never a link.
 */
export function LinkLabel({ confidence, keyed, reason, link = true, className }: { confidence: string | null; keyed?: boolean; reason?: string | null } & Look) {
  // A not-keyed reason alone says the link is not keyed.
  const state = reason != null && reason !== 'unlinked' ? false : keyed;
  if (!linkWords(confidence, { keyed: state })) return <LinkTier confidence={confidence} keyed={state} reason={reason} className={className} />;
  return <TagGroup link={link} className={className}><LinkMark confidence={confidence} keyed={state} link={link} /><LinkTier confidence={confidence} keyed={state} reason={reason} /></TagGroup>;
}

/**
 * A wrapping group of labels: what `EditionTags` and `LinkLabel` are drawn in. As links it keeps each label's 44 px
 * hit area clear of the row under it. For a page that composes its own set (a client page: `TierTag`, `SplitTierTag`,
 * `TimingClassTag`).
 */
export function TagGroup({ link = true, className, children }: Look & { children: ReactNode }) {
  return <span className={`tier-tags${link ? ' tier-tags-links' : ''}${className ? ` ${className}` : ''}`}>{children}</span>;
}

/**
 * An edition's labels in one wrapping group: its tier, then "Finish times only" and "Gun times" where they apply. As
 * links the group keeps each label's 44 px hit area clear of the next when they wrap.
 */
export function EditionTags({ tier, weakerSource, splitTier, timingBasis, link = true, className }: { tier: string; weakerSource?: boolean | null; splitTier: string; timingBasis: string | null } & Look) {
  return <TagGroup link={link} className={className}><TierTag tier={tier} weakerSource={weakerSource} link={link} /><SplitTierTag splitTier={splitTier} link={link} /><TimingTag timingBasis={timingBasis} link={link} /></TagGroup>;
}

/**
 * A race's tier line for a list row, as plain words from its editions' counts by tier: "6 verified, weaker source ·
 * 10 held for review"; one tier for all reads "16 verified"; partial editions read "3 with partial results". It is the
 * row's text, not a badge, so it carries the counts and no link: the list's key line links the words to their
 * definition once (TierTerm).
 */
export function TierLine({ counts, format, className }: { counts: Readonly<Record<string, number | undefined>>; format?: (n: number) => string; className?: string }) {
  return <span className={className ? `tier-line ${className}` : 'tier-line'}>{tierLine(counts, format)}</span>;
}

/** Words in running copy linked to the tier definitions, as SlowdownTerm links "sustained slowdown" (a list's key line). */
export function TierTerm({ children }: { children: ReactNode }) {
  return <Link href={TIER_ANCHOR} className="term-link">{children}</Link>;
}

/** Words in running copy linked to the link definitions (the line above a list of possible matches). */
export function LinkTerm({ children }: { children: ReactNode }) {
  return <Link href={LINK_ANCHOR} className="term-link">{children}</Link>;
}
