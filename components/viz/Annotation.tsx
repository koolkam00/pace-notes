import { widthClass, type PlacedLabel } from './labels';
import { pc } from './scale';

/**
 * Direct labels (the redesign spec, section 3.5): Inter 600 14 px in ink (13 px for secondary ones) with a 2 px halo of
 * the surface, on the subject, the extremes, the finding and you. Placed by placeLabels() in labels.ts; a dropped label
 * renders nothing (it stays in Values), and a label that stops fitting at 200% zoom hides through its width class.
 * `leader` draws a 1 px --ink-3 line from the point to a label placed above or below it.
 */
export default function Annotation({ labels, leader = false }: { labels: PlacedLabel[]; leader?: boolean }) {
  return (
    <g className="viz-annotations">
      {labels.map((l) => {
        if (l.minWidth === null) return null;
        const size = l.size ?? 14;
        const cls = ['viz-label', l.tone && l.tone !== 'ink' ? `is-${l.tone}` : '', size < 14 ? 'is-sm' : '', l.knockout ? 'is-knockout' : ''].filter(Boolean).join(' ');
        const vertical = l.dx === 0 || Math.abs(l.dx) <= 16;
        const above = l.dy < 0;
        const len = above ? Math.max(0, -l.dy - 3) : Math.max(0, l.dy - size * 0.78 - 3);
        return (
          <g key={l.id} className={[widthClass(l.minWidth), l.under ? 'is-under' : ''].filter(Boolean).join(' ') || undefined} data-scrub-i={l.at}>
            {leader && vertical && len > 2 ? (
              <rect className="leader" x={pc(l.x)} y={pc(l.y)} width={1} height={len} transform={`translate(-0.5 ${above ? -len - 1 : 1})`} />
            ) : null}
            <text className={cls} x={pc(l.x)} y={pc(l.y)} dx={l.dx} dy={l.dy} textAnchor={l.anchor}>{l.text}</text>
          </g>
        );
      })}
    </g>
  );
}
