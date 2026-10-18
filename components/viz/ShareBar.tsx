import type { CSSProperties, ReactNode } from 'react';
import { REF_WIDTH, textWidth } from './labels';

/**
 * A 100% share bar (the redesign spec, section 3.6): one 28 px HTML bar with 2 px gaps and exact proportions. The
 * segment the sentence is about is signal, the others take the ordinal ramp or quiet. The signal segment's name and
 * share sit above the bar in signal ink on a short leader (paper text on signal is under 4.5:1). Another segment carries
 * its label inside only when it fits with 8 px to spare at the narrowest phone and its fill holds text at 4.5:1 in both
 * themes (quiet, ordinal 1, 3 and 4; never ordinal 2). The key lists what the bar does not say: a segment's name, plus
 * its share when the share is not on the bar. A 0% segment is not drawn (it stays in Values). With `signalInside`, the
 * signal segment carries its own label inside, in night ink (4.7:1 on signal or better in both themes), where it fits
 * at the narrowest phone, so every segment is labelled the same way; else it keeps the callout.
 */
export type ShareSegment = { id: string; label: string; share: number; display: string; tone?: 'signal' | 'quiet' | 1 | 2 | 3 | 4 };

const HOLDS_TEXT = new Set<ShareSegment['tone']>(['quiet', undefined, 1, 3, 4]);

export default function ShareBar({ segments, label, values, signalInside = false }: { segments: ShareSegment[]; label: string; values?: ReactNode; signalInside?: boolean }) {
  const drawn = segments.filter((s) => s.share > 0);
  const total = drawn.reduce((sum, s) => sum + s.share, 0) || 1;
  const tone = (s: ShareSegment) => (s.tone === 'signal' ? 'is-signal' : s.tone === 'quiet' || s.tone === undefined ? 'is-quiet' : `is-ord-${s.tone}`);
  // Inside each segment: its name and share where both fit at the narrowest phone, else its share alone, else nothing.
  const inside = drawn.map((s) => {
    const room = (s.share / total) * (REF_WIDTH - 2 * (drawn.length - 1)) - 16;
    const full = `${s.label} ${s.display}`;
    if (s.tone === 'signal') return signalInside && room >= textWidth(full, 13) ? full : '';
    if (!HOLDS_TEXT.has(s.tone)) return '';
    return room >= textWidth(full, 13) ? full : room >= textWidth(s.display, 13) ? s.display : '';
  });
  // The signal segment's callout, centred over the segment and kept inside the bar's ends.
  let start = 0;
  const spans = drawn.map((s) => { const a = start; start += s.share / total; return [a, start] as const; });
  const subject = drawn.findIndex((s) => s.tone === 'signal');
  const callout = subject >= 0 && !inside[subject] ? `${drawn[subject].label} ${drawn[subject].display}` : '';
  const centre = subject >= 0 ? ((spans[subject][0] + spans[subject][1]) / 2) * 100 : 0;
  const w = callout ? Math.ceil(textWidth(callout, 14)) + 2 : 0;
  const keyed = drawn.map((s, i) => ({ s, i })).filter(({ s, i }) => i !== subject && inside[i] !== `${s.label} ${s.display}`);
  return (
    <figure className="viz viz-frame share-bar">
      {callout ? (
        <div className="share-bar-callout" aria-hidden="true">
          <span className="share-bar-callout-text" style={{ left: `clamp(0px, calc(${centre.toFixed(2)}% - ${w / 2}px), calc(100% - ${w}px))` } as CSSProperties}>{callout}</span>
          <span className="share-bar-leader" style={{ left: `${centre.toFixed(2)}%` } as CSSProperties} />
        </div>
      ) : null}
      <div className="share-bar-track" role="img" aria-label={label}>
        {drawn.map((s, i) => (
          <span key={s.id} className={`share-bar-seg ${tone(s)}`} style={{ flexGrow: s.share / total } as CSSProperties}>
            {inside[i] ? <span className="share-bar-in">{inside[i]}</span> : null}
          </span>
        ))}
      </div>
      {keyed.length ? (
        <ul className="share-bar-key" aria-hidden="true">
          {keyed.map(({ s, i }) => <li key={s.id}><i className={`share-bar-swatch ${tone(s)}`} />{s.label}{inside[i] ? null : <b>{s.display}</b>}</li>)}
        </ul>
      ) : null}
      {values}
    </figure>
  );
}
