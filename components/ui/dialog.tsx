'use client';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * The dialog behaviour every sheet shares (Sheet, Make it yours and the site menu): focus moves in and is trapped,
 * Escape closes, the page behind does not scroll, focus returns to the opener. Its own module, so the site menu, on
 * every page, does not carry the Sheet component with it.
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
