'use client';
import { type ComponentType, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UnitSwitch } from './UnitsProvider';
import MenuSheet, { WIDE, type MenuMode } from './MenuSheet';
import { usePrefersReducedMotion } from './art/useTicker';

/** Scroll this far (px) in one direction before the header moves, so a finger resting on the page does not flicker it. */
const SLACK = 6;

/** True when the focused element was reached from the keyboard (older Safari cannot match :focus-visible: assume so). */
function keyboardFocus(element: Element) {
  try { return element.matches(':focus-visible'); } catch { return true; }
}

const GLYPH = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M2.5 5.5h11M2.5 10.5h11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/**
 * The site header (the redesign spec, section 2.4): the brand, the units switch and, under 1180 px, the Menu button that
 * opens the menu sheet; from 1180 px the five links inline and a Chapters button for the chapters drawer (MenuSheet).
 * Under 1180 px it slides away while the reader scrolls down and returns as soon as they scroll up; on a reading page the
 * reading bar takes its place meanwhile. It stays while a menu is open, while it holds keyboard focus, near the top and
 * under reduced motion, and moves only by transform (header.css), so nothing below it shifts.
 *
 * `brand` (the Pace Notes link and, under it at every width, the quiet "by Andrew Kam" credit) and `chapters` (the chapter list) come from the root layout, a server
 * component, so their markup is not part of every page's JavaScript.
 */
export default function SiteHeader({ brand, chapters }: { brand: ReactNode; chapters: ReactNode }) {
  const header = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<MenuMode>(null);
  const close = useCallback(() => setOpen(null), []);
  const path = usePathname();
  const still = usePrefersReducedMotion();
  // The reading bar's code loads only on a page that has one (a root with data-reading), once the page is interactive.
  const [ReadingBar, setReadingBar] = useState<ComponentType | null>(null);

  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    if (!ReadingBar && document.querySelector('main[data-reading], main [data-reading]')) import('./ReadingBar.client').then((m) => setReadingBar(() => m.default)).catch(() => {});
  }, [path, ReadingBar]);

  // A menu opened at one width closes when the page crosses 1180 px (the other menu belongs to the other width).
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia(WIDE);
    const onChange = () => setOpen(null);
    wide.addEventListener?.('change', onChange);
    return () => wide.removeEventListener?.('change', onChange);
  }, [open]);

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    if (still) { el.removeAttribute('data-hidden'); return; }
    const wide = window.matchMedia(WIDE);
    let last = Math.max(0, window.scrollY);
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      if (Math.abs(y - last) < SLACK) return;
      const active = document.activeElement;
      const held = el.hasAttribute('data-open') || (active !== null && el.contains(active) && keyboardFocus(active));
      el.toggleAttribute('data-hidden', !wide.matches && y > last && y > el.offsetHeight && !held);
      last = y;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const reveal = () => el.removeAttribute('data-hidden');
    window.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('focusin', reveal);
    return () => {
      window.removeEventListener('scroll', onScroll);
      el.removeEventListener('focusin', reveal);
      if (frame) cancelAnimationFrame(frame);
      reveal();
    };
  }, [still]);

  const opener = (mode: Exclude<MenuMode, null>, id: string, className: string, label: string) => (
    <button type="button" className={className} data-sheet-open={id} aria-haspopup="dialog" aria-expanded={open === mode} aria-controls={id} onClick={() => setOpen(open === mode ? null : mode)}>
      <span className="nav-toggle-label">{label}</span>{GLYPH}
    </button>
  );

  return (
    <header ref={header} className="site-header" data-open={open ? '' : undefined}>
      <div className="container header-inner">
        {brand}
        <div className="header-controls">
          <MenuSheet open={open} onClose={close} chapters={chapters} />
          <UnitSwitch />
          {opener('menu', 'site-sheet', 'nav-toggle', 'Menu')}
          {opener('chapters', 'site-chapters', 'chapters-toggle', 'Chapters')}
        </div>
      </div>
      {ReadingBar && !still ? <ReadingBar /> : null}
    </header>
  );
}
