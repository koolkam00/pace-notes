/**
 * The bracket under a finish-time histogram, named in place: "80% of finishes: 3:58–4:27". The label sits in a gap in
 * the bracket's line when it fits there, otherwise just under it, kept inside the chart's edges. Drawn in pixels at the
 * chart's measured width, so the text stays 12 px.
 */

/** Width of one character of a 12 px chart label. */
const CHAR_W = 6.9;

export interface Bracket { x1: number; x2: number; label: string; inline: boolean; tx: number; w: number; height: number }

/**
 * Where the label goes, and how much height the bracket takes below its line's top. A chart too narrow for the label
 * (200% zoom) takes `short` ("80%: 3:58–4:27") instead.
 */
export function bracketLayout(x1: number, x2: number, full: string, width: number, margin: number, short?: string): Bracket {
  const label = short && full.length * CHAR_W > width - 2 * margin ? short : full;
  const w = label.length * CHAR_W;
  const inline = w + 28 <= x2 - x1;
  const mid = (x1 + x2) / 2;
  const tx = inline ? mid : Math.max(margin + w / 2, Math.min(mid, width - margin - w / 2));
  return { x1, x2, label, inline, tx, w, height: inline ? 12 : 30 };
}

/** The bracket, its line at y. */
export function RangeBracket({ b, y }: { b: Bracket; y: number }) {
  return (
    <g className="range-bracket">
      {b.inline ? (
        <>
          <line x1={b.x1} x2={b.tx - b.w / 2 - 6} y1={y} y2={y} />
          <line x1={b.tx + b.w / 2 + 6} x2={b.x2} y1={y} y2={y} />
        </>
      ) : <line x1={b.x1} x2={b.x2} y1={y} y2={y} />}
      <line x1={b.x1} x2={b.x1} y1={y - 4} y2={y + 4} />
      <line x1={b.x2} x2={b.x2} y1={y - 4} y2={y + 4} />
      <text x={b.tx} y={b.inline ? y + 4 : y + 20} textAnchor="middle">{b.label}</text>
    </g>
  );
}
