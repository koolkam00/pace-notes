'use client';

import { useMemo, useState } from 'react';
import KeypadHint from '@/components/KeypadHint';
import TypeGlyph from '@/components/viz/TypeGlyph';
import { keypadInput } from '@/lib/keypad';
import { paceColour, paceText } from '@/lib/viz/format';

const SECTION_KM = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
const MATS = ['5K', '10K', '15K', '20K', '25K', '30K', '35K', '40K', 'Finish'];

/** A checkpoint time, h:mm:ss or mm:ss; dots or commas between the groups are read as colons. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  const m = t.replace(/[.,]/g, ':').match(/^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** What the island needs of archetypes.json: the six types and the published classifier. */
export type WhichData = {
  types: { name: string; share: number; profile: number[] }[];
  classifier: { clip_lo: number[]; clip_hi: number[]; weights: number[]; centroids: number[][] };
  domain: [number, number];
};

/**
 * "Which runner were you?" (the redesign spec, section 7.5, #you): the reader's nine mat times, classified in the
 * browser with the published classifier, answer as the type's glyph, its name and its share of finishes, with the nine
 * sections as pace blocks. The root is .which-card, masked in session replays; the times live in component state only.
 * Pre-filled, so the beat never opens empty.
 */
export function WhichArchetype({ data, initial }: { data: WhichData; initial: string[] }) {
  const [values, setValues] = useState<string[]>(initial);
  const times = values.map(parseClock);
  const valid = times.every((t) => t !== null) && times.every((t, i) => i === 0 || (t as number) > (times[i - 1] as number));
  const result = useMemo(() => {
    if (!valid) return null;
    const t = times as number[];
    const finish = t[8];
    if (finish < 5400 || finish > 43200) return null;
    if (t.some((v, i) => { const pace = (v - (i ? t[i - 1] : 0)) / SECTION_KM[i]; return pace < 120 || pace > 1200; })) return null;
    const avg = finish / 42.195;
    const rel = t.map((v, i) => 100 * (((v - (i ? t[i - 1] : 0)) / SECTION_KM[i]) / avg - 1));
    const c = data.classifier;
    const xv = rel.map((v, i) => Math.min(c.clip_hi[i], Math.max(c.clip_lo[i], v)) * c.weights[i]);
    const dist = c.centroids.map((cent) => cent.reduce((s, cv, i) => s + (xv[i] - cv) ** 2, 0));
    return { rel, best: dist.indexOf(Math.min(...dist)) };
  }, [valid, times, data]);
  const type = result ? data.types[result.best] : null;
  return (
    <div className="which-card">
      <div className="which-grid">
        {MATS.map((label, i) => (
          <label key={label} className="field which-field">
            <span className="field-label">{label}</span>
            <input className="input" value={values[i]} inputMode="decimal" autoComplete="off" aria-invalid={times[i] === null || undefined}
              aria-describedby="which-help" onChange={(e) => { const typed = keypadInput(e.target, e.nativeEvent); setValues(values.map((v, k) => (k === i ? typed : v))); }} />
          </label>
        ))}
      </div>
      <p className="field-hint which-help" id="which-help">Your time at each mat, h:mm:ss.<KeypadHint /></p>
      {result && type ? (
        <div className="which-result">
          <p className="which-name t-sentence">
            <TypeGlyph profile={type.profile} index={result.best} domain={data.domain} />
            <span>You ran like a <strong>{type.name}</strong>, the shape of <em>{Math.round(type.share * 100)}%</em> of finishes.</span>
          </p>
          <ol className="which-blocks" aria-label="Each section against your own average pace">
            {result.rel.map((v, i) => {
              const bg = paceColour(v, 14);
              return (
                <li key={i} style={{ background: bg }} className={paceText(bg) === 'paper' ? 'is-dark' : undefined}>
                  <span className="which-block-mat">{MATS[i]}</span>
                  <b>{v > 0 ? '+' : v < 0 ? '−' : ''}{Math.abs(v) >= 10 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)}%</b>
                </li>
              );
            })}
          </ol>
        </div>
      ) : <p className="field-error which-error" role="alert">Each time needs h:mm:ss, later than the one before, with a finish between 1:30:00 and 12:00:00.</p>}
      <p className="sr-only" aria-live="polite">{type ? `You ran like a ${type.name}.` : 'Times not yet valid.'}</p>
    </div>
  );
}
