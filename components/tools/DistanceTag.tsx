import { UnitLink as Link } from '@/components/UnitsProvider';

// A module of its own, apart from EvidenceTag.tsx, so the pages that import the evidence badges in their first-load
// JavaScript (the predictor's) do not carry the label: the predictor draws it only in its lazily loaded half panel.

/**
 * The distance label's words (owner decision, November 5, 2026: "Half-to-marathon pairs. Keep them, but label each one
 * as a comparison between distances. Do not put halves and marathons into the same statistic."; verify-half checks them).
 */
export const DISTANCE_LABEL = 'Half-to-marathon comparison';

/**
 * The distance label: the same quiet pill as the scope chip, saying a figure compares a half with a later marathon of
 * records linked by name, never one statistic of both distances. On every linked surface once, beside the scope chip,
 * and inside every reading repeated as a link (`data-half-link`, as plain words: a link holds no link); a half-only figure
 * carries none. It links to /methodology#half-linking, which says how the pairs are made.
 */
export function DistanceTag({ link = true, className: extra }: { link?: boolean; className?: string }) {
  const className = `distance-chip${extra ? ` ${extra}` : ''}`;
  return link ? <Link href="/methodology#half-linking" className={className}>{DISTANCE_LABEL}</Link> : <span className={className}>{DISTANCE_LABEL}</span>;
}
