'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUnits } from '@/components/UnitsProvider';
import { GOAL_MAX, GOAL_MIN, isAnalysisGoal } from '@/lib/analysis-goal';
import { trackFailure } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';

const INPUT_ID = 'hero-goal-time';
const HINT = 'A finish time or a goal, as h:mm';
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

// The tools' time parsing (lib/tools/time.ts, as in their DurationField), loaded when the visitor first focuses the
// box rather than with the page: the box is on the first screen, but its parsing is needed only once someone types.
type Parsing = typeof import('@/lib/tools/time');
let parsing: Promise<Parsing> | null = null;
function loadParsing(): Promise<Parsing> {
  if (!parsing) parsing = import('@/lib/tools/time').catch((error: unknown) => { parsing = null; throw error; });
  return parsing;
}

/** A time typed the way the tools accept it, as the whole minutes the analysis reads, or the hint to show instead. */
function readTime({ parseDuration, formatDuration }: Parsing, text: string): { minutes: number; text: string } | { error: string } {
  if (!text.trim()) return { error: 'Type a time such as 4:15.' };
  const seconds = parseDuration(text, 'race');
  if (seconds === null) return { error: 'Try 3:30:00, 3:30 or 210.' };
  const minutes = Math.round(seconds / 60);
  return isAnalysisGoal(minutes) ? { minutes, text: formatDuration(seconds, true) } : { error: `Choose a time from ${hm(GOAL_MIN)} to ${hm(GOAL_MAX)}.` };
}

/**
 * The home page's "make it yours" way in (experiment home-hero-v1): a marathon time, then how finishes near it paced.
 * The time leaves the page only in the next page's address, as whole minutes (`/analyses/pacing-pattern?goal=227`),
 * which analytics never keeps. Nothing here is sent, and recordings mask the whole form (`.hero-goal`,
 * lib/replay-policy.ts). A time the analysis would not read (outside 1:30–12:00) stays here with a hint. Before the
 * page's JavaScript runs, the button opens the analysis at its 4:00 example (the form's action; the field has no name).
 */
export default function HeroGoal() {
  const router = useRouter();
  const { units, resolved } = useUnits();
  const [text, setText] = useState('');
  // Shown once the visitor leaves the field or presses the button, then kept up to date as they type.
  const [error, setError] = useState<string | null>(null);
  const latest = useRef('');
  const input = useRef<HTMLInputElement>(null);

  // While typing, only the hint follows the text; leaving the field also tidies the text (3:30 becomes 3:30:00), as the
  // tools do, and the button then opens the analysis.
  const check = async (value: string, when: 'typing' | 'left' | 'submit') => {
    let read: ReturnType<typeof readTime>;
    try { read = readTime(await loadParsing(), value); } catch {
      trackFailure('chunk_load');
      setError('The time box did not load. Check your connection and try again.');
      return;
    }
    if (value !== latest.current) return; // typed on meanwhile
    if ('error' in read) {
      setError(read.error);
      if (when === 'submit') input.current?.focus();
      return;
    }
    setError(null);
    if (when === 'typing') return;
    setText(read.text);
    latest.current = read.text;
    if (when === 'submit') { const href = `/analyses/pacing-pattern?goal=${read.minutes}`; router.push(resolved ? unitHref(href, units) : href); }
  };

  return (
    <form className="hero-goal" action="/analyses/pacing-pattern" noValidate onSubmit={(event) => { event.preventDefault(); void check(latest.current, 'submit'); }}>
      <div className="tool-field">
        <label htmlFor={INPUT_ID}>Your marathon time</label>
        <input ref={input} id={INPUT_ID} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="e.g. 4:15" value={text}
          aria-invalid={error ? true : undefined} aria-describedby={`${INPUT_ID}-hint`}
          onFocus={() => { loadParsing().catch(() => {}); }}
          onChange={(event) => { setText(event.target.value); latest.current = event.target.value; if (error) void check(event.target.value, 'typing'); }}
          onBlur={() => { if (latest.current.trim()) void check(latest.current, 'left'); }} />
        <p className={`tool-field-hint${error ? ' is-error' : ''}`} id={`${INPUT_ID}-hint`}>{error ?? HINT}</p>
      </div>
      <button type="submit" className="button-accent">See how finishers near your time paced <span aria-hidden="true">→</span></button>
    </form>
  );
}
