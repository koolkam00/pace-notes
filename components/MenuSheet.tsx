'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import SiteNav from './SiteNav';
import { UnitLink as Link } from './UnitsProvider';
import { CloseIcon, useDialog } from './ui/dialog';

export type MenuMode = 'menu' | 'chapters' | null;
/** From this width the five links sit in the header and the Chapters button opens a drawer of the chapters alone. */
export const WIDE = '(min-width: 1180px)';

/**
 * The site menu (the redesign spec, section 2.4): under 600 px a bottom sheet, from 600 to 1179 px a right drawer. Top to
 * bottom: nav#site-menu (the five links and the .nav-more line, nothing else: S1), the chapters (nav.chapter-list, server
 * markup from the root layout) and a small row of Methodology and Privacy.
 *
 * From 1180 px the same markup serves the wide header (menu.css): the sheet and its panel flatten (display: contents), so
 * nav#site-menu is one row of the header and only the chapters show, in their own right drawer (#site-chapters), opened by
 * the Chapters button. One copy of every link at every width.
 *
 * Each open dialog traps focus, closes on Escape, on its scrim and on its close button, returns focus to its opener and
 * locks the page's scroll (useDialog). Closed, it is inert, and hidden until it has slid away; which element is inert
 * depends on the width, so that is set here in the browser (CSS visibility covers the moment before).
 */
export default function MenuSheet({ open, onClose, chapters }: { open: MenuMode; onClose: () => void; chapters: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLDivElement>(null), drawerPanel = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLElement | null>(null), body = useRef<HTMLDivElement>(null);
  active.current = open === 'chapters' ? drawerPanel.current : panel.current;
  useDialog(!!open, onClose, active);
  useEffect(() => {
    const wide = window.matchMedia(WIDE);
    const apply = () => {
      sheet.current?.toggleAttribute('inert', !wide.matches && open !== 'menu');
      drawer.current?.toggleAttribute('inert', wide.matches && open !== 'chapters');
    };
    apply();
    // Each time it opens, the menu starts at its top: the five links.
    if (open && body.current) body.current.scrollTop = 0;
    wide.addEventListener?.('change', apply);
    return () => wide.removeEventListener?.('change', apply);
  }, [open]);
  const dialog = (on: boolean, title: string) => (on ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': title } : {});
  const close = (label: string) => <button type="button" className="sheet-close" onClick={onClose} aria-label={label}><CloseIcon /></button>;
  return (
    <div ref={sheet} id="site-sheet" className={`menu-sheet${open === 'menu' ? ' is-open' : ''}`} {...dialog(open === 'menu', 'site-sheet-title')}>
      <div className="sheet-scrim" id="site-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="menu-panel" tabIndex={-1}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="menu-head"><p className="sheet-title" id="site-sheet-title">Menu</p>{close('Close menu')}</div>
        <div ref={body} className="menu-body">
          <SiteNav id="site-menu" />
          <div ref={drawer} id="site-chapters" className={`menu-chapters${open === 'chapters' ? ' is-open' : ''}`} {...dialog(open === 'chapters', 'site-chapters-title')}>
            <div className="sheet-scrim" id="site-chapters-scrim" onClick={onClose} aria-hidden="true" />
            <div ref={drawerPanel} className="menu-chapters-panel" tabIndex={-1}>
              <div className="menu-chapters-head"><p className="sheet-title" id="site-chapters-title">Chapters</p>{close('Close chapters')}</div>
              {chapters}
            </div>
          </div>
          <p className="menu-foot"><Link href="/methodology" className="menu-foot-link">Methodology</Link><Link href="/privacy" className="menu-foot-link">Privacy</Link></p>
        </div>
      </div>
    </div>
  );
}
