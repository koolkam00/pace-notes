'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { UnitLink } from '@/components/UnitsProvider';
import Arrow from './Arrow';
import { withEm } from './withEm';

/**
 * Guess first, at most one per page (spec section 3.5). A question, a live "Your guess" readout, Lock it in or Skip,
 * then the reveal on the same marks: the truth as a signal fill, the guess as an orange ring labelled You, a comparison
 * hollow. On the ruler the ruler itself is the control: the You ring is the thumb (a native range laid over the ruler,
 * 44 px tall, its own track and thumb invisible), so one guess has one scale. After the reveal it is read-only. The verdict states the gap in plain numbers and never scolds, then the page's own sentence
 * (`answer`, from lib/nuggets/). The guess lives in component state only: no storage, no URL, no analytics.
 *
 * The root carries .which-card, a masked token in lib/replay-policy.ts, so session replay never sees the guess. Never
 * place it on /stories/pacing-types (S2's .which-card input is the type calculator's there), and never on a number the
 * H1 already states.
 *
 * `marks`: "ruler" (a 0 to max scale) or "dots" (100 finishes, for a share out of 100). Values are on the slider's
 * scale (0 to 100 for a share). With dots, a `compare` is a second 100 beside the guess's from the start (the question
 * gives it), its lit dots in ink, each grid named under it (`truthName` names the guess's); the reveal then shows the two
 * side by side. `after` (a line, a card's link) shows only once the answer is out, so nothing before the guess gives it
 * away.
 */
type Props = {
  question: string;
  truth: number;
  answer: string;
  truthLabel?: string;
  compare?: { value: number; label: string };
  /** Dots with a compare: the guess's own grid's name ("Recorded women’s"), with the truth's count once revealed. */
  truthName?: string;
  /** What shows under the verdict once the answer is out (a further comparison, a card that prints the answer). */
  after?: ReactNode;
  marks?: 'ruler' | 'dots';
  min?: number;
  max?: number;
  step?: number;
  initial?: number;
  unit?: '%' | 'of 100';
  next?: { href: string; label: string };
};

type State = 'asking' | 'locked' | 'revealed' | 'skipped';

export default function GuessFirst({ question, truth, answer, truthLabel, compare, truthName, after, marks = 'ruler', min = 0, max = 100, step = 1, initial, unit = '%', next }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [guess, setGuess] = useState(initial ?? Math.round((min + max) / 2 / step) * step);
  const [state, setState] = useState<State>('asking');
  // Until the reader moves the guess, its rings are drawn quiet: the loudest thing on screen is never a guess nobody made.
  const [touched, setTouched] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-motion-off'));
  }, []);

  const revealed = state === 'revealed' || state === 'skipped';
  const fmt = (v: number) => (unit === '%' ? `${Math.round(v)}%` : `${Math.round(v)} of 100`);
  const lock = () => {
    if (still) { setState('revealed'); return; }
    setState('locked');
    window.setTimeout(() => setState('revealed'), 260);
  };
  const gap = Math.round(Math.abs(guess - truth));
  // A share guessed as a percentage is "points" off; a count of 100 finishes needs no gap in words, the dots show it.
  const off = unit === '%' ? `, ${gap} ${gap === 1 ? 'point' : 'points'} ${guess > truth ? 'high' : 'low'}.` : '.';
  const verdict = !revealed ? '' : state === 'skipped'
    ? answer
    : `${gap <= Math.max(1, step) ? `You guessed ${fmt(guess)}, right on it.` : `You guessed ${fmt(guess)}${off}`} ${answer}`;
  const at = (v: number) => `${((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * 100}%`;
  const edge = (v: number) => (v - min) / (max - min || 1) < 0.08 ? ' at-start' : (v - min) / (max - min || 1) > 0.92 ? ' at-end' : '';

  const range = (
    <input
      id={`${id}-range`} className={`guess-range${marks === 'ruler' ? ' is-on-ruler' : ''}`} type="range" min={min} max={max} step={step} value={guess}
      disabled={revealed} aria-label="Your guess" aria-describedby={`${id}-q`} aria-valuetext={fmt(guess)}
      style={{ ['--fill' as string]: at(guess) }}
      onChange={(e) => { setGuess(Number(e.target.value)); setTouched(true); }}
    />
  );

  return (
    <div className={`guess which-card${revealed ? ' is-revealed' : ''}${state === 'skipped' ? ' is-skipped' : ''}${touched || revealed ? ' is-touched' : ''}`}>
      <p className="guess-question t-sentence" id={`${id}-q`}>{withEm(question)}</p>
      {/* Once revealed, the verdict says the guess, so the readout steps out (no number twice on one screen). */}
      {!revealed ? (
        <div>
          <div className="guess-readout">
            <label className="guess-readout-key" htmlFor={`${id}-range`}>Your guess</label>
            <span className="guess-readout-value" aria-hidden="true">{Math.round(guess)}{unit === '%' ? <small className="is-pct">%</small> : <small>of 100</small>}</span>
          </div>
          {marks === 'dots' ? range : null}
        </div>
      ) : null}

      <div className="guess-marks">
        {marks === 'dots' ? (
          <>
            <div className={`guess-dots-set${compare ? ' has-compare' : ''}`}>
              <div className="guess-dots-fig">
                <ol className="guess-dots" aria-hidden="true">
                  {Array.from({ length: 100 }, (_, i) => (
                    <li key={i} className={`guess-dot${revealed && i < Math.round(truth) ? ' is-lit' : ''}${state !== 'skipped' && i < Math.round(guess) ? ' is-you' : ''}`} style={{ ['--i' as string]: i }} />
                  ))}
                </ol>
                {compare ? <p className="guess-dots-name is-truth" aria-hidden="true">{truthName ?? ''}{revealed ? <>: <b>{Math.round(truth)}</b></> : null}</p> : null}
              </div>
              {compare ? (
                <div className="guess-dots-fig is-compare">
                  <ol className="guess-dots" aria-hidden="true">
                    {Array.from({ length: 100 }, (_, i) => <li key={i} className={`guess-dot${i < Math.round(compare.value) ? ' is-compare' : ''}`} />)}
                  </ol>
                  <p className="guess-dots-name" aria-hidden="true">{compare.label}: <b>{Math.round(compare.value)}</b></p>
                </div>
              ) : null}
            </div>
            <div className="guess-dots-key" aria-hidden="true">
              {state !== 'skipped' ? <span><i className="is-you" />You</span> : null}
              {revealed ? <span><i className="is-lit" />{truthLabel ?? 'Recorded finishes'}</span> : null}
            </div>
          </>
        ) : (
          <>
            <div className="guess-ruler">
              <span className="guess-ruler-line" aria-hidden="true" />
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <span key={f} aria-hidden="true">
                  <span className="guess-ruler-tick" style={{ left: `${f * 100}%` }} />
                  <span className={`guess-ruler-tick-label t-tick${f === 0 ? ' at-start' : f === 1 ? ' at-end' : ''}`} style={{ left: `${f * 100}%`, ...(f === 0 ? { transform: 'none' } : f === 1 ? { transform: 'translateX(-100%)' } : {}) }}>
                    {unit === '%' ? `${Math.round(min + f * (max - min))}%` : Math.round(min + f * (max - min))}
                  </span>
                </span>
              ))}
              {range}
              <span aria-hidden="true">
                {compare ? <span className="guess-mark is-compare" style={{ left: at(compare.value) }} /> : null}
                <span className="guess-mark is-truth" style={{ left: at(truth) }} />
                <span className={`guess-mark-label is-truth${edge(truth)}`} style={{ left: at(truth) }}>{truthLabel ? `${fmt(truth)} ${truthLabel}` : fmt(truth)}</span>
                {state !== 'skipped' ? <><span className="guess-mark is-you" style={{ left: at(guess) }} /><span className={`guess-mark-label is-you${edge(guess)}`} style={{ left: at(guess) }}>You</span></> : null}
              </span>
            </div>
            {compare ? <div className="guess-key" aria-hidden="true"><span><i />{compare.label}</span></div> : null}
          </>
        )}
      </div>

      {!revealed ? (
        <div className="guess-actions">
          <button type="button" className="btn btn-secondary is-compact" onClick={lock} disabled={state === 'locked'}>Lock it in</button>
          <button type="button" className="guess-skip" onClick={() => setState('skipped')}>Skip, show me</button>
        </div>
      ) : null}
      <p className="guess-verdict t-sentence" aria-live="polite">{verdict ? withEm(verdict) : null}</p>
      {revealed && after ? <div className="guess-after">{after}</div> : null}
      {revealed && next ? <UnitLink className="guess-next" href={next.href}>{next.label}<Arrow /></UnitLink> : null}
    </div>
  );
}
