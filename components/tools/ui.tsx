'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatDuration, parseDuration, type DurationMode } from '@/lib/tools/time';

/**
 * A duration input that keeps the visitor's text while they type and reports seconds (or null) upward.
 * Accepts h:mm:ss, mm:ss, "3h30", minutes, and keypad dots ("8.05").
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
  return (
    <div className={`tool-field${large ? ' is-large' : ''}`}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder={placeholder} autoFocus={autoFocus}
        value={text} aria-invalid={invalid || undefined} aria-describedby={hint || invalid ? `${inputId}-hint` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const next = e.target.value.trim() ? parseDuration(e.target.value, mode) : null;
          last.current = next;
          onChange(next);
        }}
        onBlur={() => { setTouched(true); if (parsed !== null) setText(formatDuration(parsed, mode === 'race')); }} />
      {unreadable ? <p className="tool-field-hint is-error" id={`${inputId}-hint`}>Try {mode === 'race' ? '3:30:00, 3:30 or 210' : '8:05'}.</p>
        : error ? <p className="tool-field-hint is-error" id={`${inputId}-hint`}>{error}</p>
        : hint ? <p className="tool-field-hint" id={`${inputId}-hint`}>{hint}</p> : null}
    </div>
  );
}

/** Pill buttons for choosing one option. */
export function Choice<T extends string | number>({ label, options, value, onChange, small = false }: {
  label: string; options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <div className={`segmented tool-choice${small ? ' is-small' : ''}`} role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
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

/** A panel whose header says what kind of evidence is inside. */
export function EvidencePanel({ kind, title, meta, children, id }: { kind: 'arithmetic' | 'data' | 'research' | 'official'; title: ReactNode; meta?: ReactNode; children: ReactNode; id?: string }) {
  const label = { arithmetic: 'Arithmetic', data: 'Pace Notes data', research: 'Published research', official: 'Official standards' }[kind];
  return (
    <section className={`tool-panel panel-${kind}`} id={id}>
      <header className="tool-panel-head">
        <span className={`evidence-badge evidence-${kind}`}>{label}</span>
        <h2 className="tool-panel-title">{title}</h2>
        {meta ? <p className="tool-panel-meta">{meta}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Copy-link and print buttons. */
export function ShareBar({ print = true, extra }: { print?: boolean; extra?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="tool-share no-print">
      <button type="button" className="button-secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ }
      }}>{copied ? 'Link copied' : 'Copy link'}</button>
      {print ? <button type="button" className="button-secondary" onClick={() => window.print()}>Print</button> : null}
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
