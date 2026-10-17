import { typeStyle } from '@/lib/viz/palette';

/**
 * A pacing type's glyph (the redesign spec, section 3.5): a 40 × 18 sparkline of its centroid, on one y scale shared by
 * every type (`domain`), stroked in the type's colour (the night set inside .night and in dark mode). It always sits
 * next to the type's name, so it is decoration to a screen reader.
 */
export default function TypeGlyph({ profile, index, domain }: { profile: number[]; index: number; domain: [number, number] }) {
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const n = profile.length;
  const d = profile.map((v, i) => `${i ? 'L' : 'M'}${(2 + (36 * i) / Math.max(1, n - 1)).toFixed(2)} ${(2 + 14 * (1 - (v - lo) / span)).toFixed(2)}`).join('');
  return (
    <svg className="type-glyph" viewBox="0 0 40 18" width="40" height="18" aria-hidden="true" focusable="false" style={typeStyle(index)}>
      <path d={d} />
    </svg>
  );
}
