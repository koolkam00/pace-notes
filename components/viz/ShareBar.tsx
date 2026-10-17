import type { CSSProperties, ReactNode } from 'react';
import { REF_WIDTH, textWidth } from './labels';

/**
 * A 100% share bar (the redesign spec, section 3.6): one 28 px HTML bar with 2 px gaps and exact proportions. The
 * segment the sentence is about is signal, the others take the ordinal ramp or quiet. A label goes inside a segment only
 * when it fits with 8 px to spare at the narrowest phone; a segment not named inside is in the key under the bar, with
 * its share. A 0% segment is not drawn (it stays in Values).
 */
export type ShareSegment = { id: string; label: string; share: number; display: string; tone?: 'signal' | 'quiet' | 1 | 2 | 3 | 4 };

export default function ShareBar({ segments, label, values }: { segments: ShareSegment[]; label: string; values?: ReactNode }) {
  const drawn = segments.filter((s) => s.share > 0);
  const total = drawn.reduce((sum, s) => sum + s.share, 0) || 1;
  const tone = (s: ShareSegment) => (s.tone === 'signal' ? 'is-signal' : s.tone === 'quiet' || s.tone === undefined ? 'is-quiet' : `is-ord-${s.tone}`);
  // Inside each segment: its name and share where both fit at the narrowest phone, else its share alone, else nothing;
  // the key lists every segment not named inside.
  const inside = drawn.map((s) => {
    const room = (s.share / total) * (REF_WIDTH - 2 * (drawn.length - 1)) - 16;
    const full = `${s.label} ${s.display}`;
    return room >= textWidth(full, 13) ? full : room >= textWidth(s.display, 13) ? s.display : '';
  });
  const keyed = drawn.filter((s, i) => inside[i] !== `${s.label} ${s.display}`);
  return (
    <figure className="viz viz-frame share-bar">
      <div className="share-bar-track" role="img" aria-label={label}>
        {drawn.map((s, i) => (
          <span key={s.id} className={`share-bar-seg ${tone(s)}`} style={{ flexGrow: s.share / total } as CSSProperties}>
            {inside[i] ? <span className="share-bar-in">{inside[i]}</span> : null}
          </span>
        ))}
      </div>
      {keyed.length ? (
        <ul className="share-bar-key" aria-hidden="true">
          {keyed.map((s) => <li key={s.id}><i className={`share-bar-swatch ${tone(s)}`} />{s.label}<b>{s.display}</b></li>)}
        </ul>
      ) : null}
      {values}
    </figure>
  );
}
