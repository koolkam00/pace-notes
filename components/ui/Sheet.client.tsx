'use client';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * A sheet (spec sections 2.4 and 3.5): a bottom sheet under 600 px and a right drawer from 600 px, for the menu, Make it
 * yours and share. A modal dialog: focus moves in and is trapped, Escape and the scrim close it, focus returns to the
 * opener, the page behind does not scroll. Closed, it is inert (nothing in it takes focus) and hidden once it has slid
 * away. Rendered in place, never through a portal, so it stays inside any masked region around it.
 *
 * The opener carries data-sheet-open={id} (SheetButton does this); the scrim is #{id}-scrim.
 */

/** `inert` as an attribute React 18 renders (its types call it a boolean; the DOM wants it present or absent). */
export const inertWhen = (on: boolean) => (on ? { inert: '' } : {}) as Record<string, string>;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Focus trap, Escape, scroll lock and focus return for an open dialog panel. `enabled` lets a caller switch it off. */
export function useDialog(open: boolean, onClose: () => void, panel: RefObject<HTMLElement>, enabled = true) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !enabled) return;
    opener.current = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    root.classList.add('has-sheet-open');
    const el = panel.current;
    const items = () => Array.from(el?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.offsetParent !== null || n === document.activeElement);
    // Focus the first control after the slide starts (a focused element inside a transform still scrolls into view).
    const t = window.setTimeout(() => { (items()[0] ?? el)?.focus({ preventScroll: true }); }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !el.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !el.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      root.classList.remove('has-sheet-open');
      const back = opener.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [open, enabled, onClose, panel]);
}

export const CloseIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

export default function Sheet({ id, title, open, onClose, children, className }: {
  id: string; title: ReactNode; open: boolean; onClose: () => void; children: ReactNode; className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, panel);
  const titleId = `${id}-title`;
  return (
    <div className={`sheet${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`} id={id} role="dialog" aria-modal="true" aria-labelledby={titleId} {...inertWhen(!open)}>
      <div className="sheet-scrim" id={`${id}-scrim`} onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="sheet-panel" tabIndex={-1}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 className="sheet-title" id={titleId}>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** A button that opens its own sheet: the usual way to use one. */
export function SheetButton({ id, title, label, className, children }: { id?: string; title: ReactNode; label: ReactNode; className?: string; children: ReactNode }) {
  const auto = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const sheetId = id ?? `sheet-${auto}`;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} data-sheet-open={sheetId} aria-haspopup="dialog" aria-expanded={open} aria-controls={sheetId} onClick={() => setOpen(true)}>{label}</button>
      <Sheet id={sheetId} title={title} open={open} onClose={close}>{children}</Sheet>
    </>
  );
}
