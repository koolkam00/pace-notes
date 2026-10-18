'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
 * "Where did your finish land?" (the redesign spec, section 7.8, #my-finish), folded into the towers chart above it:
 * the root (.finish-lookup) holds the chart (`children`) and, under it, the reader's finish time. A time that reads moves
 * the chart's needle to its minute (a 'scrub-to' event on the scrubber), so the readout above the plot says how many
 * finishes landed there and how that minute stands against the smooth curve, and the needle's foot becomes an orange
 * ring marked "You" (is-yours). Moving the needle anywhere else (a drag, a scrolly step) takes the ring away. Nothing is
 * called "you" that the reader did not enter.
 *
 * The root is masked in session replays (its text, state attributes and inline styles: the needle's position) and its
 * svg is left out of them; the time lives in component state only: no storage, no address, no analytics.
 *
 * `first` is the chart's first minute and `bins` its count per minute; `expected` the smooth curve's count for the same
 * minutes (0 where none), for the screen-reader line.
 */
export default function MyFinish({ first, bins, expected, children }: { first: number; bins: number[]; expected: number[]; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [mine, setMine] = useState(false);
  const seconds = parseTime(text);
  const minute = seconds === null ? null : Math.floor(seconds / 60);
  const i = minute === null ? -1 : minute - first;
  const inRange = i >= 0 && i < bins.length;
  const n = inRange ? bins[i] : 0;
  const ratio = inRange && expected[i] > 0 ? n / expected[i] : null;
  const problem = !text ? '' : seconds === null ? 'Enter h:mm or h:mm:ss between 1:30 and 12:00.' : !inRange ? 'That minute is outside the chart.' : '';
  const message = !text ? '' : problem || `${hm(minute!)}: ${n.toLocaleString('en-US')} finishes${ratio !== null ? `, ${ratio.toFixed(2)}× the curve` : ''}.`;

  // A time that reads sets the needle (again after each edit); the ring stays while the needle is on that minute.
  useEffect(() => {
    const el = root.current;
    const slider = el?.querySelector<HTMLElement>('.scrub [role="slider"]');
    if (!el || !slider || !inRange) { setMine(false); return; }
    el.querySelector('.scrub')?.dispatchEvent(new CustomEvent('scrub-to', { detail: i }));
    setMine(true);
    const watch = new MutationObserver(() => { if (Number(slider.getAttribute('aria-valuenow')) !== i) setMine(false); });
    watch.observe(slider, { attributes: true, attributeFilter: ['aria-valuenow'] });
    return () => watch.disconnect();
  }, [seconds, i, inRange]);

  const side = inRange && (i + 0.5) / bins.length > 0.8 ? ' is-left' : '';
  return (
    <div ref={root} className={`finish-lookup${mine ? ' is-yours' : ''}${mine ? side : ''}`}>
      {children}
      <span id="your-minute" className="beat-alias" aria-hidden="true" />
      <div className="finish-lookup-field field">
        <label className="field-label" htmlFor="my-finish">Find your finish on the chart</label>
        <input id="my-finish" className="input" inputMode="decimal" autoComplete="off" placeholder="h:mm:ss" value={text}
          aria-describedby="my-finish-result" aria-invalid={text !== '' && seconds === null ? true : undefined}
          onChange={(e) => setText(keypadInput(e.target, e.nativeEvent))} />
        <KeypadHint block />
      </div>
      {/* The chart's readout says it on screen; this line is for screen readers, and shows only when the time cannot be read. */}
      <p className={`finish-lookup-result${problem ? '' : ' sr-only'}`} id="my-finish-result" aria-live="polite">{message}</p>
    </div>
  );
}
