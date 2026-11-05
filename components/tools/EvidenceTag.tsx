import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';

export type EvidenceKind = 'data' | 'research' | 'official';

const NAMES: Record<EvidenceKind, string> = { data: 'Pace Notes data', research: 'Published research', official: 'Official standards' };

/**
 * The evidence badges and the half pages' scope chip are drawn here and nowhere else.
 *
 * The evidence badge (Pace Notes data, published research or official standards): a glyph and a word with no hue, the
 * glyph drawn by app/styles/components/badge.css (● data, ◆ research, ■ official) so the markup stays a bare label. It links to the methodology page,
 * which says what each kind is; `link={false}` keeps it a plain label inside another link, such as a card.
 */
export function EvidenceTag({ kind, link = true, className: extra, children }: { kind: EvidenceKind; link?: boolean; className?: string; children?: ReactNode }) {
  const className = `evidence-badge evidence-${kind}${extra ? ` ${extra}` : ''}`;
  const label = children ?? NAMES[kind];
  return link ? <Link href="/methodology#evidence" className={className}>{label}</Link> : <span className={className}>{label}</span>;
}

/** The scope chip's words (the half-marathon pages' one label; verify-half checks them). */
export const SCOPE_CHIP = 'Includes unverified half results';

/**
 * The scope chip: a quiet outlined pill beside a Pace Notes data badge (or under a linked half figure's dek) saying the
 * figure includes unverified half results. It qualifies the data badge and is not an evidence kind; it carries no number.
 * Once per surface, on every figure of records linked by name (a half-only figure, from verified results, carries none).
 * It links to /methodology#half-coverage, which says what verified means; `link={false}` keeps it a plain label inside
 * another link, such as a card.
 */
export function ScopeTag({ link = true, className: extra }: { link?: boolean; className?: string }) {
  const className = `scope-chip${extra ? ` ${extra}` : ''}`;
  return link ? <Link href="/methodology#half-coverage" className={className}>{SCOPE_CHIP}</Link> : <span className={className}>{SCOPE_CHIP}</span>;
}

/** "Sustained slowdown" linked to its definition on the methodology page. */
export function SlowdownTerm({ children = 'sustained slowdown' }: { children?: ReactNode }) {
  return <Link href="/methodology#sustained-slowdown" className="term-link">{children}</Link>;
}
