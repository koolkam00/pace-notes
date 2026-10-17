/**
 * Arrows as inline SVG (spec section 3.2): → ↗ ← ↓ ↑ fall outside the Latin range of the site's Inter, so text arrows
 * would draw in a fallback font. Decorative: the link or button around it carries the words.
 */
const PATHS = {
  right: 'M3 8h10M9 4l4 4-4 4',
  left: 'M13 8H3M7 4L3 8l4 4',
  'up-right': 'M5 11l6-6M6 5h5v5',
  down: 'M8 3v10M4 9l4 4 4-4',
  up: 'M8 13V3M4 7l4-4 4 4',
} as const;

export type ArrowDirection = keyof typeof PATHS;

export default function Arrow({ dir = 'right', className }: { dir?: ArrowDirection; className?: string }) {
  return (
    <svg className={`arrow-icon${className ? ` ${className}` : ''}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={PATHS[dir]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
