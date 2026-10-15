'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUnits } from '@/components/UnitsProvider';
import { GOAL_MAX, GOAL_MIN, isAnalysisGoal } from '@/lib/analysis-goal';
import { trackFailure } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';

const INPUT_ID = 'hero-goal-time';
// A phone's number keypad has a dot but no colon, so the hint names both.
const HINT = 'A finish time or a goal, such as 4:15 or 4.15.';
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

// The tools' time parsing (lib/tools/time.ts, as in their DurationField), loaded when the visitor first focuses the
// box rather than with the page: the box is on the first screen, but its parsing is needed only once someone types.
type Parsing = typeof import('@/lib/tools/time');
let parsing: Promise<Parsing> | null = null;
function loadParsing(): Promise<Parsing> {
  if (!parsing) parsing = import('@/lib/tools/time').catch((error: unknown) => { parsing = null; throw error; });
  return parsing;
}

type Reading = { minutes: number; text: string; bare: boolean } | { error: string };

/**
 * A time typed the way the tools accept it, as the whole minutes the analysis reads (the minute at or below it, as every
 * tool hands a time on: 3:45:40 is 3:45), or the hint to show instead. `bare` marks digits alone, which the tools read
 * as minutes ("415" is 6:55) but a visitor on a keypad without a colon may have meant as 4:15.
 */
function readTime({ parseDuration }: Parsing, value: string): Reading {
  const typed = value.trim();
  if (!typed) return { error: 'Type a time such as 4:15.' };
  const seconds = parseDuration(typed, 'race');
  if (seconds === null) return { error: 'Try 3:30, 3.30 or 3:30:00.' };
  const minutes = Math.floor(seconds / 60);
  return isAnalysisGoal(minutes) ? { minutes, text: hm(minutes), bare: /^\d+$/.test(typed) } : { error: `Choose a time from ${hm(GOAL_MIN)} to ${hm(GOAL_MAX)}.` };
}

/** What a bare number says once it has been read as minutes, with the h:mm it may have meant when that is a time too. */
function minutesNote(digits: string, text: string) {
  const asTime = /^(\d{1,2})([0-5]\d)$/.exec(digits);
  const meant = asTime && isAnalysisGoal(Number(asTime[1]) * 60 + Number(asTime[2])) ? `, or type ${asTime[1]}.${asTime[2]} for ${asTime[1]}:${asTime[2]}` : '';
  return `That reads as ${digits} minutes (${text}). Press again to use it${meant}.`;
}

/**
 * The home page's "make it yours" way in (experiment home-hero-v1): a marathon time, then how finishes near it paced.
 * The time leaves the page only in the next page's address, as whole minutes (`/analyses/pacing-pattern?goal=227`),
 * which analytics never keeps. Nothing here is sent, and recordings mask the whole form (`.hero-goal`,
 * lib/replay-policy.ts). A time the analysis would not read (outside 1:30–12:00) stays here with a hint, and digits
 * alone are shown as the minutes they read as before a second press uses them. Before the page's JavaScript runs, the
 * button opens the analysis at its 4:00 example (the form's action; the field has no name).
 */
export default function HeroGoal() {
  const router = useRouter();
  const { units, resolved } = useUnits();
  const [text, setText] = useState('');
  // Shown once the visitor leaves the field or presses the button, then kept up to date as they type.
  const [error, setError] = useState<string | null>(null);
  // How a bare number was read, after a press that did not use it yet.
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef('');
  // Counts the visitor's edits, so a check that finishes after more typing is dropped, but tidying the text is not an edit.
  const edits = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  // While typing, only the hint follows the text; leaving the field also tidies the text to the minute it reads as
  // (3:30:00 becomes 3:30), and the button then opens the analysis. A press usually leaves the field first, and both
  // checks may wait for the parsing together: the tidying never cancels the press.
  const check = async (value: string, when: 'typing' | 'left' | 'submit') => {
    const edit = edits.current;
    let read: Reading;
    try { read = readTime(await loadParsing(), value); } catch {
      trackFailure('chunk_load');
      setError('The time box did not load. Check your connection and try again.');
      return;
    }
    if (edit !== edits.current) return; // typed on meanwhile
    if ('error' in read) {
      setError(read.error);
      setNote(null);
      if (when === 'submit') input.current?.focus();
      return;
    }
    setError(null);
    if (when === 'typing' || (when === 'left' && read.bare)) return;
    setText(read.text);
    latest.current = read.text;
    if (read.bare) { setNote(minutesNote(value.trim(), read.text)); return; }
    setNote(null);
    if (when === 'submit') { const href = `/analyses/pacing-pattern?goal=${read.minutes}`; router.push(resolved ? unitHref(href, units) : href); }
  };

  return (
    <form className="hero-goal" action="/analyses/pacing-pattern" noValidate onSubmit={(event) => { event.preventDefault(); void check(latest.current, 'submit'); }}>
      <div className="tool-field">
        <label htmlFor={INPUT_ID}>Your marathon time</label>
        <input ref={input} id={INPUT_ID} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="e.g. 4:15" value={text}
          aria-invalid={error ? true : undefined} aria-describedby={`${INPUT_ID}-hint`}
          onFocus={() => { loadParsing().catch(() => {}); }}
          onChange={(event) => { setText(event.target.value); latest.current = event.target.value; edits.current += 1; setNote(null); if (error) void check(event.target.value, 'typing'); }}
          onBlur={() => { if (latest.current.trim()) void check(latest.current, 'left'); }} />
        <p className={`tool-field-hint${error ? ' is-error' : ''}`} id={`${INPUT_ID}-hint`} aria-live="polite">{error ?? note ?? HINT}</p>
      </div>
      <button type="submit" className="button-accent">See how finishers near your time paced <span aria-hidden="true">→</span></button>
    </form>
  );
}
