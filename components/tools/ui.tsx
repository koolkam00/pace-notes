'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatDuration, formatHM, parseDuration, type DurationMode } from '@/lib/tools/time';
import { paceBandGoalHref, pacingPatternHref } from '@/lib/tools/links';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { withUnits } from '@/lib/unit-preference';
import { trackAnalytics } from '@/lib/analytics';

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

/**
 * A panel whose header says what kind of evidence is inside: Pace Notes data, published research or official standards.
 * Panels of plain calculations from the visitor's own inputs (splits, pace charts) leave out `kind` and carry no badge.
 */
export function EvidencePanel({ kind, title, meta, children, id }: { kind?: 'data' | 'research' | 'official'; title: ReactNode; meta?: ReactNode; children: ReactNode; id?: string }) {
  const label = kind ? { data: 'Pace Notes data', research: 'Published research', official: 'Official standards' }[kind] : null;
  return (
    <section className={`tool-panel panel-${kind ?? 'plain'}`} id={id}>
      <header className="tool-panel-head">
        {label ? <span className={`evidence-badge evidence-${kind}`}>{label}</span> : null}
        <h2 className="tool-panel-title">{title}</h2>
        {meta ? <p className="tool-panel-meta">{meta}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Marks results computed from a tool's example inputs, the same way in every tool. Hide it once the visitor changes anything. */
export function ExampleNote({ children }: { children?: ReactNode }) {
  return (
    <p className="tool-example">
      <span className="tool-example-tag">Example</span>
      <span>{children ?? 'These results use example inputs. Type yours; everything updates as you type.'}</span>
    </p>
  );
}

/**
 * Next steps from a result: cards that open another tool or analysis with the result filled in. The value travels in
 * the link's query only (analytics keeps a page's path alone), and the page it opens shows it in its own masked
 * workspace, as if typed. Following a link is not a tool edit: components/SiteAnalytics.tsx counts typing, choices
 * and buttons.
 */
export function ToolHandoffs({ label, links }: { label: string; links: { href: string; title: string; text: ReactNode; accent: string }[] }) {
  if (!links.length) return null;
  return (
    <nav className="tool-handoffs no-print" aria-label={label}>
      <p className="tool-handoffs-label">{label}</p>
      <ul>
        {links.map((l) => (
          <li key={l.href} style={{ ['--tool' as string]: l.accent }}>
            <Link href={l.href}><b>{l.title} <span aria-hidden="true">→</span></b><span>{l.text}</span></Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Where a marathon time (whole minutes) goes next: a pace band for it, and how finishes near it were paced. */
export function MarathonHandoffs({ label, minutes }: { label: string; minutes: number }) {
  const band = paceBandGoalHref(minutes);
  const pacing = pacingPatternHref(minutes);
  const time = formatHM(minutes * 60);
  // The pace band shows observed mat times for goals from 2:30 to 6:30, and an even-pace band alone outside them.
  const observed = minutes >= 150 && minutes <= 390;
  return (
    <ToolHandoffs label={label} links={[
      ...(band ? [{ href: band, accent: 'var(--orange)', title: 'Turn this into a pace band',
        text: observed ? `Even splits for ${time}, beside the mat times of finishes that just beat it.` : `Even splits for ${time}, ready to print.` }] : []),
      ...(pacing ? [{ href: pacing, accent: 'var(--blue)', title: 'See how finishers near this time paced', text: `Pace through each section for finishes near ${time}.` }] : []),
    ]} />
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
      <button type="button" className="button-secondary" onClick={async () => {
        const { origin, pathname, search, hash } = window.location;
        try {
          await navigator.clipboard.writeText(origin + withUnits(pathname + search + hash, units));
          trackAnalytics('tool_used', { action: 'copy_link' });
          setCopied(true); setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard unavailable */ }
      }}>{copied ? 'Link copied' : 'Copy link'}</button>
      {print ? <button type="button" className="button-secondary" data-not-edit onClick={() => window.print()}>Print</button> : null}
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
