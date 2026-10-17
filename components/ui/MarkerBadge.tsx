/**
 * A course marker (spec section 3.5): the chapter's place on the race, START 5K 10K HALF 30K FINISH, or 07 to 11 for the
 * chapters after the finish. An ink plate (a paper plate on night); FINISH has a checkered left edge. Decorative when
 * the chapter is named in the text beside it, so it is hidden from screen readers unless `label` is given.
 */
export const MARKERS = ['START', '5K', '10K', 'HALF', '30K', 'FINISH', '07', '08', '09', '10', '11'] as const;
export type Marker = (typeof MARKERS)[number];

export default function MarkerBadge({ marker, label, className }: { marker: Marker; label?: string; className?: string }) {
  const cls = `marker-badge${marker === 'FINISH' ? ' is-finish' : ''}${className ? ` ${className}` : ''}`;
  return label
    ? <span className={cls} role="img" aria-label={label}>{marker}</span>
    : <span className={cls} aria-hidden="true">{marker}</span>;
}
