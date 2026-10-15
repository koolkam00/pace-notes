'use client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UnitSwitch } from './UnitsProvider';
import SiteNav from './SiteNav';
import { usePrefersReducedMotion } from './art/useTicker';

/** The phone header (globals.css): one row, the links behind a Menu button, out of the way while the reader scrolls down. */
const COMPACT = '(max-width: 720px)';
/** Scroll this far (px) in one direction before the header moves, so a finger resting on the page does not flicker it. */
const SLACK = 6;

/** True when the focused element was reached from the keyboard (older Safari cannot match :focus-visible: assume so). */
function keyboardFocus(element: Element) {
  try { return element.matches(':focus-visible'); } catch { return true; }
}

/**
 * `brand` (the Pace Notes link and the credit) and `menuIcon` come from the root layout, a server component, so their
 * markup is not part of every page's JavaScript.
 */
export default function SiteHeader({ brand, menuIcon }: { brand: ReactNode; menuIcon: ReactNode }) {
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const still = usePrefersReducedMotion();

  useEffect(() => { setOpen(false); }, [path]);

  // The menu closes with Escape (focus goes back to its button), a tap outside the header, or when the page widens past it.
  useEffect(() => {
    if (!open) return;
    const compact = window.matchMedia(COMPACT);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    const onPointer = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(false); };
    const onWiden = () => { if (!compact.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    compact.addEventListener?.('change', onWiden);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      compact.removeEventListener?.('change', onWiden);
    };
  }, [open]);

  // On phones the header slides away while the reader scrolls down and comes back as soon as they scroll up. It stays
  // while its menu is open, while it holds keyboard focus, near the top of the page, and always under reduced motion.
  // It only moves with transform (globals.css), so nothing below it shifts.
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    if (still) { el.removeAttribute('data-hidden'); return; }
    const compact = window.matchMedia(COMPACT);
    let last = Math.max(0, window.scrollY);
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      if (Math.abs(y - last) < SLACK) return;
      const active = document.activeElement;
      const held = el.hasAttribute('data-open') || (active !== null && el.contains(active) && keyboardFocus(active));
      el.toggleAttribute('data-hidden', compact.matches && y > last && y > el.offsetHeight && !held);
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

  return (
    <header ref={header} className="site-header" data-open={open || undefined}>
      <div className="container header-inner">
        {brand}
        <div className="header-controls">
          <button ref={toggle} type="button" className="nav-toggle" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}>
            {menuIcon}
          </button>
          <SiteNav id="site-menu" onFollow={() => setOpen(false)} />
          <UnitSwitch />
        </div>
      </div>
    </header>
  );
}
