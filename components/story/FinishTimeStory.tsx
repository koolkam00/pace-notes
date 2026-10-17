'use client';

import { useState, type ReactNode } from 'react';
import KeypadHint from '@/components/KeypadHint';
import { keypadInput } from '@/lib/keypad';

/** A finish time, h:mm or h:mm:ss from 1:30 to 12:00; dots or commas between the groups are read as colons. */
export function parseTime(text: string): number | null {
  const m = text.trim().replace(/[.,]/g, ':').match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  return seconds >= 5400 && seconds < 43200 ? seconds : null;
}

const hm = (minute: number) => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;

/**
 * "Where did your finish land?" (the redesign spec, section 7.8, #my-finish): the reader's finish time finds its minute
 * on the round-numbers histogram, drawn on the server and passed in as `children`; this island only reads the field and
 * places the needle and the "You" ring. The root is .finish-lookup, masked in session replays, and the time lives in
 * component state only: no storage, no address, no analytics.
 *
 * `bins` holds one count per minute from `first`; `expected` the smooth curve's count for the same minutes (0 where none).
 */
export default function MyFinish({ first, bins, expected, tops, children }: {
  first: number; bins: number[]; expected: number[];
  /** Each minute's tower top, as a fraction of the plot from the top, so the ring sits on it. */
  tops: number[]; children: ReactNode;
}) {
  const [text, setText] = useState('');
  const seconds = parseTime(text);
  const minute = seconds === null ? null : Math.floor(seconds / 60);
  const i = minute === null ? -1 : minute - first;
  const inRange = i >= 0 && i < bins.length;
  const n = inRange ? bins[i] : 0;
  const ratio = inRange && expected[i] > 0 ? n / expected[i] : null;
  const x = inRange ? ((i + 0.5) / bins.length) * 100 : 0;
  const message = !text
    ? 'Type a finish time to find its minute.'
    : seconds === null ? 'Enter h:mm or h:mm:ss between 1:30 and 12:00.'
      : !inRange ? 'That minute is outside the chart.'
        : `${hm(minute!)}: ${n.toLocaleString('en-US')} finishes${ratio !== null ? `, ${ratio.toFixed(2)}× the curve` : ''}.`;
  return (
    <div className="finish-lookup viz-frame">
      <div className="finish-lookup-field field">
        <label className="field-label" htmlFor="my-finish">Your finish time</label>
        <input id="my-finish" className="input" inputMode="decimal" autoComplete="off" placeholder="3:58:42" value={text}
          aria-describedby="my-finish-result" aria-invalid={text !== '' && seconds === null ? true : undefined}
          onChange={(e) => setText(keypadInput(e.target, e.nativeEvent))} />
        <KeypadHint block />
      </div>
      {inRange ? (
        <div className="readout finish-lookup-readout" aria-hidden="true">
          <div className="readout-main">
            <span className="readout-key">Finishes in {hm(minute!)}:00–:59</span>
            <span className="readout-value">{n.toLocaleString('en-US')}</span>
          </div>
          {ratio !== null ? <dl className="readout-side"><div><dt>Against the curve</dt><dd>{ratio.toFixed(2)}×</dd></div></dl> : null}
        </div>
      ) : null}
      <div className="finish-lookup-plot">
        {children}
        {inRange ? (
          <span className="finish-lookup-you" style={{ left: `${x}%`, top: `calc(${tops[i]} * var(--lookup-h, 140px))`, ['--t' as string]: tops[i] }} aria-hidden="true">
            <span className="finish-lookup-needle" /><span className="finish-lookup-ring" /><span className="finish-lookup-tag">You</span>
          </span>
        ) : null}
      </div>
      {/* The readout says it on screen once a minute is found; the sentence stays for screen readers. */}
      <p className={`finish-lookup-result${inRange ? ' sr-only' : ''}`} id="my-finish-result" aria-live="polite">{message}</p>
    </div>
  );
}
