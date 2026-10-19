'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import KeypadHint from '@/components/KeypadHint';
import TypeGlyph from '@/components/viz/TypeGlyph';
import { keypadInput } from '@/lib/keypad';
import { PACE_RAMP_DARK, paceColour, paceText } from '@/lib/viz/format';
import { MARATHON_KM, sectionLabel } from '@/lib/units';
import { classifyTimes, parseClock } from '@/lib/pacing-type';

const MATS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish'];
/** The nine sections the blocks stand for: 0–5K … 35–40K, 40K–finish. */
const SECTIONS = MATS.map((_, i) => sectionLabel(i * 5, i === 8 ? MARATHON_KM : (i + 1) * 5));
/** How far a block's colour runs (percent either way of the reader's own average pace). */
const SPAN = 14;

/** What the island needs of archetypes.json: the six types and the published classifier. */
export type WhichData = {
  types: { name: string; share: number; profile: number[] }[];
  classifier: { clip_lo: number[]; clip_hi: number[]; weights: number[]; centroids: number[][] };
  domain: [number, number];
};

/**
 * "Which runner were you?" (the redesign spec, section 7.5, #you): the reader's nine mat times, classified in the
 * browser with the published classifier, answer as the type's glyph, its name and its share of finishes, with the nine
 * sections as pace blocks. The answer comes first, for a pre-filled example, so the beat never opens on a form or
 * empty; the nine fields sit behind "Try your own splits". The root is .which-card, masked in session replays; the
 * times live in component state only. The beat's heading gives the example's reading (lib/pacing-type at build), so the
 * card says its sentence only once the reader changes a time ("You ran like …").
 */
export function WhichArchetype({ data, initial }: { data: WhichData; initial: string[] }) {
  const [values, setValues] = useState<string[]>(initial);
  const [edited, setEdited] = useState(false);
  const times = values.map(parseClock);
  const key = times.join(',');
  const result = useMemo(() => classifyTimes(times, data.classifier), [key, data]);
  const type = result ? data.types[result.best] : null;
  const grid = (
    <>
      <div className="which-grid">
        {MATS.map((label, i) => (
          <label key={label} className="field which-field">
            <span className="field-label">{label}</span>
            <input className="input" value={values[i]} inputMode="decimal" autoComplete="off" aria-invalid={times[i] === null || undefined}
              aria-describedby="which-help" onChange={(e) => { const typed = keypadInput(e.target, e.nativeEvent); setEdited(true); setValues(values.map((v, k) => (k === i ? typed : v))); }} />
          </label>
        ))}
      </div>
      <p className="field-hint which-help" id="which-help">Your time at each mat, h:mm:ss.<KeypadHint /></p>
    </>
  );
  return (
    <div className="which-card">
      {/* The answer first (the example's, until a time is changed), then the nine fields behind one row: a form never
          opens a beat. */}
      {result && type ? (
        <div className="which-result">
          {/* The example's reading is the beat's heading, so its name is not said again here; the reader's own reading
              appears once they change a time. */}
          {edited ? (
            <p className="which-name t-sentence">
              <TypeGlyph profile={type.profile} index={result.best} domain={data.domain} />
              <span>You ran like {/^[AEIOU]/i.test(type.name) ? 'an' : 'a'} <strong>{type.name}</strong>, the shape of {Math.round(type.share * 100)}% of finishes.</span>
            </p>
          ) : null}
          <ol className="which-blocks" aria-label={`Each section against ${edited ? 'your' : 'its'} own average pace`}>
            {result.rel.map((v, i) => {
              const bg = paceColour(v, SPAN);
              // --bg-dark: the dark theme's own ramp (story.css), never the light one blended into the surface.
              const style = { '--bg': bg, '--bg-dark': paceColour(v, SPAN, PACE_RAMP_DARK) } as CSSProperties;
              return (
                <li key={i} style={style} className={paceText(bg) === 'paper' ? 'is-dark' : undefined}>
                  <span className="which-block-mat">{SECTIONS[i]}</span>
                  <b>{Math.abs(v) < 0.05 ? '' : v > 0 ? '+' : '−'}{Math.abs(v) < 0.05 ? '0.0' : Math.abs(v).toFixed(1)}%</b>
                </li>
              );
            })}
          </ol>
          {/* The key is the blocks' own ramp, five steps from faster to slower, in the dark theme's own colours there. */}
          <p className="which-key" aria-hidden="true">
            Faster
            <span className="which-ramp">
              {[-SPAN, -SPAN / 2, 0, SPAN / 2, SPAN].map((v) => <i key={v} style={{ '--bg': paceColour(v, SPAN), '--bg-dark': paceColour(v, SPAN, PACE_RAMP_DARK) } as CSSProperties} />)}
            </span>
            Slower than {edited ? 'your' : 'its'} own average pace
          </p>
        </div>
      ) : <p className="field-error which-error" role="alert">Each time needs h:mm:ss, later than the one before, with a finish between 1:30:00 and 12:00:00.</p>}
      <details className="values which-try" open={edited || undefined}>
        <summary>
          <span>{edited ? 'Your splits' : 'Try your own splits'}</span>
          <span className="values-glyph" aria-hidden="true" />
        </summary>
        <div className="which-try-body">{grid}</div>
      </details>
      <p className="sr-only" aria-live="polite">{type ? `${edited ? 'You' : 'This example'} ran like ${/^[AEIOU]/i.test(type.name) ? 'an' : 'a'} ${type.name}.` : 'Times not yet valid.'}</p>
    </div>
  );
}
