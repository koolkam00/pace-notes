'use client';

import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatDuration, parseDuration, type DurationMode } from '@/lib/tools/time';
import { useUnits } from '@/components/UnitsProvider';
import { withUnits } from '@/lib/unit-preference';
import { trackAnalytics } from '@/lib/analytics';
import { keypadInput } from '@/lib/keypad';
import KeypadHint from '@/components/KeypadHint';

/**
 * A duration input that keeps the visitor's text while they type and reports seconds (or null) upward.
 * Accepts h:mm:ss, mm:ss, "3h30", minutes, and keypad dots ("8.05"). In a race time the dot key types a colon as it is
 * typed (lib/keypad.ts), with the "Tap . for :" hint on touch screens; a pace keeps its dot ("8.5" is 8.5 minutes) and
 * shows m:ss once the visitor leaves the field.
 */
export function DurationField({ label, value, onChange, mode = 'race', placeholder, hint, error, id, autoFocus, large = false }: {
  label: ReactNode; value: number | null; onChange: (seconds: number | null) => void; mode?: DurationMode;
  placeholder?: string; hint?: ReactNode; id?: string; autoFocus?: boolean; large?: boolean;
  /** A message from the caller (e.g. a value outside a method's range); shown as an error in place of the hint. */
  error?: ReactNode;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const [text, setText] = useState(value === null ? '' : formatDuration(value, mode === 'race'));
  const [touched, setTouched] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    // Follow outside changes (steppers, presets) without fighting the visitor's typing.
    if (value !== last.current) {
      last.current = value;
      if (value === null || parseDuration(text, mode) !== value) setText(value === null ? '' : formatDuration(value, mode === 'race'));
    }
  }, [value, mode, text]);
  const parsed = text.trim() ? parseDuration(text, mode) : null;
  const unreadable = touched && text.trim() !== '' && parsed === null;
  const invalid = unreadable || Boolean(error);
  const keypad = mode === 'race' ? <KeypadHint /> : null;
  return (
    <div className={`tool-field${large ? ' is-large' : ''}`}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder={placeholder} autoFocus={autoFocus}
        value={text} aria-invalid={invalid || undefined} aria-describedby={hint || invalid ? `${inputId}-hint` : undefined}
        onChange={(e) => {
          const typed = keypadInput(e.target, e.nativeEvent, mode);
          setText(typed);
          const next = typed.trim() ? parseDuration(typed, mode) : null;
          last.current = next;
          onChange(next);
        }}
        onBlur={() => { setTouched(true); if (parsed !== null) setText(formatDuration(parsed, mode === 'race')); }} />
      {unreadable ? <p className="tool-field-hint is-error" id={`${inputId}-hint`}>Try {mode === 'race' ? '3:30:00, 3:30 or 210' : '8:05'}.{keypad}</p>
        : error ? <p className="tool-field-hint is-error" id={`${inputId}-hint`}>{error}{keypad}</p>
        : hint ? <p className="tool-field-hint" id={`${inputId}-hint`}>{hint}{keypad}</p> : mode === 'race' ? <KeypadHint block /> : null}
    </div>
  );
}

/**
 * A segmented choice of 2 to 5 options: buttons in role="group" with aria-pressed (the pattern the verifiers read),
 * drawn as the site's segmented control (app/styles/components/segmented.css) with the pressed option raised. No thumb
 * script: the pressed button carries the raised surface itself, so nothing moves on load.
 */
export function Choice<T extends string | number>({ label, options, value, onChange, small = false }: {
  label: string; options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <div className={`seg tool-choice${small ? ' is-small' : ''}`} role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.value)} type="button" className="seg-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}><span className="seg-label">{o.label}</span></button>)}
    </div>
  );
}

/** − / + buttons around a value, for nudging a goal by a minute. `labels` names the two directions (default faster / slower). */
export function Stepper({ label, onStep, step = 60, labels = ['faster', 'slower'], children }: {
  label: string; onStep: (delta: number) => void; step?: number; labels?: [string, string]; children: ReactNode;
}) {
  const amount = step >= 60 ? `${step / 60} minute` : `${step} seconds`;
  return (
    <div className="tool-stepper">
      <button type="button" aria-label={`${label}: ${amount} ${labels[0]}`} onClick={() => onStep(-step)}>−</button>
      <div className="tool-stepper-value">{children}</div>
      <button type="button" aria-label={`${label}: ${amount} ${labels[1]}`} onClick={() => onStep(step)}>+</button>
    </div>
  );
}

/**
 * The goal bar (phones, goal-driven tools; the redesign spec, section 3.5): once the inputs have scrolled out of view, a
 * slim night stepper sticks to the bottom of the results, "− 4:00 · 9:09/mi +", so the goal can be nudged while reading
 * what it does. It is the results' last child, inside the left-out results region, and hidden from 900 px, where the
 * inputs stay in view beside the results.
 */
export function GoalBar({ label, onStep, step = 60, labels, disabled, children }: {
  label: string; onStep: (delta: number) => void; step?: number; labels?: [string, string]; disabled?: [boolean, boolean]; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const inputs = ref.current?.closest('.tool-workspace')?.querySelector('.tool-inputs');
    if (!inputs || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(inputs);
    return () => io.disconnect();
  }, []);
  const amount = step >= 60 ? `${step / 60} minute${step === 60 ? '' : 's'}` : `${step} seconds`;
  const [faster, slower] = labels ?? ['faster', 'slower'];
  return (
    <div ref={ref} className="tool-goalbar night no-print" data-shown={shown ? '' : undefined} aria-hidden={shown ? undefined : true}>
      <button type="button" tabIndex={shown ? undefined : -1} aria-disabled={disabled?.[0] || undefined} aria-label={`${label}: ${amount} ${faster}`} onClick={() => { if (!disabled?.[0]) onStep(-step); }}>−</button>
      <span className="tool-goalbar-value">{children}</span>
      <button type="button" tabIndex={shown ? undefined : -1} aria-disabled={disabled?.[1] || undefined} aria-label={`${label}: ${amount} ${slower}`} onClick={() => { if (!disabled?.[1]) onStep(step); }}>+</button>
    </div>
  );
}

/** A big number with a label, for headline results. */
export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'muted' }) {
  return (
    <div className={`tool-stat${tone ? ` is-${tone}` : ''}`}>
      <span className="tool-stat-label">{label}</span>
      <strong className="tool-stat-value">{value}</strong>
      {sub ? <span className="tool-stat-sub">{sub}</span> : null}
    </div>
  );
}

/**
 * A panel whose header says what kind of evidence is inside: Pace Notes data, published research or official standards.
 * Panels of plain calculations from the visitor's own inputs (splits, pace charts) leave out `kind` and carry no badge.
 */
export function EvidencePanel({ kind, title, meta, children, id }: { kind?: 'data' | 'research' | 'official'; title: ReactNode; meta?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={`tool-panel panel-${kind ?? 'plain'}`} id={id}>
      <header className="tool-panel-head">
        {kind ? <EvidenceTag kind={kind} /> : null}
        <h2 className="tool-panel-title">{title}</h2>
        {meta ? <p className="tool-panel-meta">{meta}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Marks results computed from a tool's example inputs, the same way in every tool: one quiet line. Hide it once the visitor changes anything. */
export function ExampleNote({ children }: { children?: ReactNode }) {
  return (
    <p className="tool-example">
      <span className="tool-example-tag">Example</span>
      <span>{children ?? 'Type yours; everything updates as you type.'}</span>
    </p>
  );
}

/**
 * Copy-link and print buttons. The copied link carries the units on screen, so it opens the same way for someone else.
 * `.share-bar` keeps these out of the count of tool edits (components/SiteAnalytics.tsx): a copied link is counted on
 * its own, and so is printing.
 */
export function ShareBar({ print = true, extra }: { print?: boolean; extra?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const { units } = useUnits();
  return (
    <div className="tool-share share-bar no-print">
      <button type="button" className="btn btn-secondary is-compact" onClick={async () => {
        const { origin, pathname, search, hash } = window.location;
        try {
          await navigator.clipboard.writeText(origin + withUnits(pathname + search + hash, units));
          trackAnalytics('tool_used', { action: 'copy_link' });
          setCopied(true); setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard unavailable */ }
      }}>{copied ? 'Link copied' : 'Copy link'}</button>
      {print ? <button type="button" className="btn btn-secondary is-compact" data-not-edit onClick={() => window.print()}>Print</button> : null}
      {extra}
      <span className="sr-only" aria-live="polite">{copied ? 'Link copied to the clipboard' : ''}</span>
    </div>
  );
}

/**
 * Loading and error states for data panels. The status sits in one region that stays mounted while the panel is,
 * so screen readers hear each change once instead of a region appearing and disappearing.
 */
export function DataState({ error, loading, children }: { error?: string | null; loading?: boolean; children?: ReactNode }) {
  return (
    <>
      {/* Visually hidden and absolutely positioned, so it adds no gap inside grid layouts. */}
      <p className="sr-only" aria-live="polite">{error ?? (loading ? 'Loading the data…' : '')}</p>
      {/* The live region above carries the text for assistive tech; the visible copy is not read twice. */}
      {error ? <p className="tool-state is-error" aria-hidden="true">{error}</p> : loading ? <p className="tool-state" aria-hidden="true">Loading the data…</p> : children}
    </>
  );
}
