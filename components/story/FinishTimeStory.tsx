'use client';

import { useState } from 'react';
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
 * and the readout under the field says how many finishes landed in it and how it stands against the smooth curve. Until
 * a time is typed the readout shows the busiest minute, named as such, so the beat never opens empty and nothing is
 * called "you" that the reader did not enter. The minute histogram itself is the towers' beat above. The root is
 * .finish-lookup, masked in session replays, and the time lives in component state only: no storage, no address, no
 * analytics.
 *
 * `bins` holds one count per minute from `first`; `expected` the smooth curve's count for the same minutes (0 where
 * none); `busiest` the busiest minute.
 */
export default function MyFinish({ first, bins, expected, busiest }: { first: number; bins: number[]; expected: number[]; busiest: number }) {
  const [text, setText] = useState('');
  const seconds = parseTime(text);
  const minute = seconds === null ? null : Math.floor(seconds / 60);
  const i = minute === null ? -1 : minute - first;
  const inRange = i >= 0 && i < bins.length;
  const at = inRange ? i : busiest - first;
  const n = bins[at] ?? 0;
  const ratio = expected[at] > 0 ? n / expected[at] : null;
  const problem = !text ? '' : seconds === null ? 'Enter h:mm or h:mm:ss between 1:30 and 12:00.' : !inRange ? 'That minute is outside the published range.' : '';
  const message = !text ? '' : problem || `${hm(minute!)}: ${n.toLocaleString('en-US')} finishes${ratio !== null ? `, ${ratio.toFixed(2)}× the curve` : ''}.`;
  return (
    <div className="finish-lookup viz-frame">
      <div className="finish-lookup-field field">
        <label className="field-label" htmlFor="my-finish">Your finish time</label>
        <input id="my-finish" className="input" inputMode="decimal" autoComplete="off" placeholder="h:mm:ss" value={text}
          aria-describedby="my-finish-result" aria-invalid={text !== '' && seconds === null ? true : undefined}
          onChange={(e) => setText(keypadInput(e.target, e.nativeEvent))} />
        <KeypadHint block />
      </div>
      <div className={`readout finish-lookup-readout${inRange ? ' is-yours' : ''}`} aria-hidden="true">
        <div className="readout-main">
          <span className="readout-key">{inRange ? `Finishes in ${hm(minute!)}:00–:59` : `The busiest minute, ${hm(busiest)}:00–:59`}</span>
          <span className="readout-value">{n.toLocaleString('en-US')}</span>
        </div>
        {ratio !== null ? <dl className="readout-side"><div><dt>Against the curve</dt><dd>{ratio.toFixed(2)}×</dd></div></dl> : null}
      </div>
      {/* The readout says it on screen; the sentence is for screen readers, and shows only when the time cannot be read. */}
      <p className={`finish-lookup-result${problem ? '' : ' sr-only'}`} id="my-finish-result" aria-live="polite">{message}</p>
    </div>
  );
}
