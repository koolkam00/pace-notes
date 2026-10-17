import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';

export type EvidenceKind = 'data' | 'research' | 'official';

const NAMES: Record<EvidenceKind, string> = { data: 'Pace Notes data', research: 'Published research', official: 'Official standards' };

/**
 * The evidence badge (Pace Notes data, published research or official standards). It links to the methodology page,
 * which says what each kind is; `link={false}` keeps it a plain label inside another link, such as a card.
 */
export function EvidenceTag({ kind, link = true, className: extra, children }: { kind: EvidenceKind; link?: boolean; className?: string; children?: ReactNode }) {
  const className = `evidence-badge evidence-${kind}${extra ? ` ${extra}` : ''}`;
  const label = children ?? NAMES[kind];
  return link ? <Link href="/methodology#evidence" className={className}>{label}</Link> : <span className={className}>{label}</span>;
}

/** "Sustained slowdown" linked to its definition on the methodology page. */
export function SlowdownTerm({ children = 'sustained slowdown' }: { children?: ReactNode }) {
  return <Link href="/methodology#sustained-slowdown" className="term-link">{children}</Link>;
}
