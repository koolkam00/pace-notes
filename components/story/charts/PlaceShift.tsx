import type { CSSProperties } from 'react';

/**
 * Big moves after 30K (the redesign spec, section 7.6, #shuffle, under section 00): two bars on one scale, so the H2's
 * ratio ("3 to 1") reads as length. The first row is the H2's subject (big drops), the one signal mark; the other is
 * ink. Each bar is at least 12 px, so a small share never reads as a rendering sliver, and its share sits at its end.
 * HTML, exact proportions; the histogram behind it is in All numbers.
 */
export type ShiftRow = { id: string; label: string; share: number; display: string; tone: 'ink' | 'signal' };

export default function PlaceShift({ rows, label }: { rows: ShiftRow[]; label: string }) {
  const max = Math.max(...rows.map((r) => r.share), 1e-9);
  return (
    <figure className="viz viz-frame place-shift">
      <div className="ps-rows" role="img" aria-label={label}>
        {rows.map((r) => (
          <div key={r.id} className="ps-row" aria-hidden="true">
            <span className="ps-label">{r.label}</span>
            <span className="ps-track">
              <span className={`ps-bar is-${r.tone}`} style={{ '--f': (r.share / max).toFixed(4) } as CSSProperties} />
              <b className="ps-value">{r.display}</b>
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
