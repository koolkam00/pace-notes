import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { LINK_ANCHOR, TIER_ANCHOR, linkWords, splitTierWords, tierHasBadge, tierLine, tierWords, timingWords } from '@/lib/tiers';

// The tier and link labels (lead decision D16, November 14, 2026) are drawn here and nowhere else. Their words, and the
// release's codes they answer to, are lib/tiers.ts; their look is app/styles/components/badge.css. A module of its own,
// apart from the evidence badges (components/tools/EvidenceTag.tsx), so a page carries only the labels it shows.
//
// No client script: no state, effect or handler, so each label renders in a server page and in a client component
// alike. Every label has two modes. `link` (the default) is a link to the word's definition on /methodology with a
// 44 px hit area; `link={false}` is a bare label, for a row, card or checkbox label that is itself a control (a link
// holds no link). A label never carries a number or a hue. A code the vocabulary does not know stops the render.

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
 * "Gun times", on an edition the release times gross; nothing for every other. `timingBasis` is the release's
 * `timing_basis` text, the short code GROSS_TIMING, or null where the release states none.
 */
export function TimingTag({ timingBasis, link = true, className }: { timingBasis: string | null } & Look) {
  const words = timingWords(timingBasis);
  return words ? <Label form="tier-chip" href={TIER_ANCHOR} link={link} className={className} data={{ 'data-timing': 'gross' }}>{words}</Label> : null;
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
 * An edition's labels in one wrapping group: its tier, then "Finish times only" and "Gun times" where they apply. As
 * links the group keeps each label's 44 px hit area clear of the next when they wrap.
 */
export function EditionTags({ tier, weakerSource, splitTier, timingBasis, link = true, className }: { tier: string; weakerSource?: boolean | null; splitTier: string; timingBasis: string | null } & Look) {
  const cls = `tier-tags${link ? ' tier-tags-links' : ''}${className ? ` ${className}` : ''}`;
  return <span className={cls}><TierTag tier={tier} weakerSource={weakerSource} link={link} /><SplitTierTag splitTier={splitTier} link={link} /><TimingTag timingBasis={timingBasis} link={link} /></span>;
}

/**
 * A race's tier line for a list row, as plain words from its editions' counts by tier: "6 verified, weaker source ·
 * 10 held for review"; one tier for all reads "16 verified". It is the row's text, not a badge, so it carries the counts
 * and no link: the list's key line links the words to their definition once (TierTerm).
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
