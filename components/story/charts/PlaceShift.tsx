import type { CSSProperties, ReactNode } from 'react';

/**
 * The whole field after 30K as one 100% bar (the redesign spec, section 7.6, #shuffle, under section 00): big drops,
 * everything between, and big gains, left to right. A bracket spans the share that moved up (from `up.at`, a fraction of
 * the bar); the two tails are ink and named under the bar's ends with their shares, so the drops against the gains read
 * at a glance, and the one quiet middle carries no figure a reader would add up against the headline's. HTML, exact
 * proportions, 2 px gaps; the histogram behind it is in Values.
 */
export type ShiftSegment = { id: string; label: string; share: number; display: string; tone: 'ink' | 'quiet' };

export default function PlaceShift({ segments, up, label, values }: {
  /** Left to right: lost the most … gained the most. The first and last are the tails named under the bar. */
  segments: ShiftSegment[];
  /** The bracket over the gains: from `at` (a fraction of the bar) to the end. */
  up: { at: number; label: string };
  label: string;
  values?: ReactNode;
}) {
  const total = segments.reduce((s, x) => s + x.share, 0) || 1;
  const upStart = Math.max(0, Math.min(1, up.at));
  const first = segments[0], last = segments[segments.length - 1];
  return (
    <figure className="viz viz-frame place-shift">
      <div className="ps-bracket" aria-hidden="true" style={{ marginLeft: `${(upStart * 100).toFixed(2)}%` } as CSSProperties}>
        <span className="ps-bracket-label">{up.label}</span>
      </div>
      <div className="ps-track" role="img" aria-label={label}>
        {segments.map((x) => <span key={x.id} className={`ps-seg is-${x.tone}`} style={{ flexGrow: x.share / total } as CSSProperties} />)}
      </div>
      <div className="ps-ends" aria-hidden="true">
        <span className="ps-end"><b>{first.display}</b>{first.label}</span>
        <span className="ps-end is-right"><b>{last.display}</b>{last.label}</span>
      </div>
      {values}
    </figure>
  );
}
