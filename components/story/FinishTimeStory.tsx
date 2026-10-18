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
 * on a small silhouette of every finish, minute by minute, where it shows as an orange ring marked "You"; the readout
 * above says how many finishes landed in that minute and how it stands against the smooth curve. Until a time is typed
 * the silhouette marks an example minute (the median finish), named as such, so the beat never opens empty and nothing
 * is called "you" that the reader did not enter. The root is .finish-lookup, masked in session replays (its svg is left
 * out of them), and the time lives in component state only: no storage, no address, no analytics.
 *
 * `bins` holds one count per minute from `first`; `expected` the smooth curve's count for the same minutes (0 where
 * none); `example` the minute shown before a time is typed, `exampleLabel` its name; `ticks` the minutes the axis names.
 */
export default function MyFinish({ first, bins, expected, example, exampleLabel, ticks }: {
  first: number; bins: number[]; expected: number[]; example: number; exampleLabel: string; ticks: number[];
}) {
  const [text, setText] = useState('');
  const seconds = parseTime(text);
  const minute = seconds === null ? null : Math.floor(seconds / 60);
  const i = minute === null ? -1 : minute - first;
  const inRange = i >= 0 && i < bins.length;
  const at = inRange ? i : Math.max(0, Math.min(bins.length - 1, example - first));
  const n = bins[at] ?? 0;
  const ratio = expected[at] > 0 ? n / expected[at] : null;
  const problem = !text ? '' : seconds === null ? 'Enter h:mm or h:mm:ss between 1:30 and 12:00.' : !inRange ? 'That minute is outside the published range.' : '';
  const message = !text ? '' : problem || `${hm(minute!)}: ${n.toLocaleString('en-US')} finishes${ratio !== null ? `, ${ratio.toFixed(2)}× the curve` : ''}.`;
  // The silhouette: one step per minute, the tallest 16% under the top so the ring and its tag have room above it.
  const max = Math.max(1, ...bins);
  const h = (v: number) => 1000 - (v / max) * 840;
  const w = 1000 / bins.length;
  const d = `M0 1000${bins.map((v, k) => `L${(k * w).toFixed(1)} ${h(v).toFixed(1)}L${((k + 1) * w).toFixed(1)} ${h(v).toFixed(1)}`).join('')}L1000 1000Z`;
  const left = `${(((at + 0.5) / bins.length) * 100).toFixed(2)}%`, top = `${(h(n) / 10).toFixed(2)}%`;
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
          <span className="readout-key">{inRange ? `Finishes in ${hm(minute!)}:00–:59` : `${exampleLabel}, ${hm(first + at)}:00–:59`}</span>
          <span className="readout-value">{n.toLocaleString('en-US')}</span>
        </div>
        {ratio !== null ? <dl className="readout-side"><div><dt>Against the curve</dt><dd>{ratio.toFixed(2)}×</dd></div></dl> : null}
      </div>
      <div className="finish-lookup-plot" aria-hidden="true">
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%"><path className="a-silhouette" d={d} /></svg>
        <span className={`finish-lookup-mark${inRange ? ' is-you' : ''}`} style={{ left, top }} />
        {inRange ? <span className="finish-lookup-tag" style={{ left, top }}>You</span> : null}
      </div>
      <div className="finish-lookup-axis" aria-hidden="true">
        {ticks.filter((m) => m >= first && m < first + bins.length).map((m) => <span key={m} style={{ left: `${(((m - first + 0.5) / bins.length) * 100).toFixed(2)}%` }}>{hm(m)}</span>)}
      </div>
      {/* The readout says it on screen; the sentence is for screen readers, and shows only when the time cannot be read. */}
      <p className={`finish-lookup-result${problem ? '' : ' sr-only'}`} id="my-finish-result" aria-live="polite">{message}</p>
    </div>
  );
}
