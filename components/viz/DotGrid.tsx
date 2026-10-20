import type { CSSProperties, ReactNode } from 'react';

/**
 * 100 finishes (the redesign spec, section 3.5): a 10 × 10 grid of 12 px dots, at most 220 px wide. `lit` dots (of 100)
 * are the reading in --signal, or --ink for a comparison grid (`compare`); the rest are quiet with a ring; `you` rings
 * that many dots in orange. Always read as "of 100 finishes", and said so in its label.
 */
export default function DotGrid({ lit, you, compare = false, label, caption, className }: {
  lit: number; you?: number; compare?: boolean; label: string; caption?: ReactNode; className?: string;
}) {
  const on = Math.max(0, Math.min(100, Math.round(lit)));
  const ringed = you === undefined ? 0 : Math.max(0, Math.min(100, Math.round(you)));
  return (
    <figure className={`viz dot-grid${compare ? ' is-compare' : ''}${className ? ` ${className}` : ''}`}>
      <ol className="dot-grid-dots" role="img" aria-label={label}>
        {Array.from({ length: 100 }, (_, i) => (
          <li key={i} className={[i < on ? 'is-lit' : '', i < ringed ? 'is-you' : ''].filter(Boolean).join(' ') || undefined} style={i < on ? ({ '--i': i } as CSSProperties) : undefined} />
        ))}
      </ol>
      {caption ? <figcaption className="dot-grid-caption">{caption}</figcaption> : null}
    </figure>
  );
}
