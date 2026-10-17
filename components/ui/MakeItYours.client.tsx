'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon, inertWhen, useDialog } from './dialog';

/**
 * Make it yours: a chip and a sheet (spec section 3.5). Under 900 px a 48 px ink pill floats 12 px above the bottom
 * safe area while its explorer beat is on screen (never over the hero, a next card or the footer) and opens a bottom
 * sheet holding the page's existing control form; from 900 px the same form renders inline at the top of the beat, so
 * every label, id and button the tests pin is one DOM instance at every width. No portal: it stays inside the page's
 * masked .analysis-layout. Under 360 px the chip sits inline at the top of the beat.
 *
 * Put it first inside the explorer beat (an element with class miy-beat, which reserves room for the chip under 900 px).
 * `summary` is the current selection ("All courses · 4:00 · All ages"); `busy` draws the updating underline and dims
 * the results (elements with class miy-results inside the beat).
 */
const PHONE = '(max-width: 899.98px)';
const AVOID = '[data-track-section="hero"], .next-card, body > footer, .footer, [data-miy-avoid]';

export default function MakeItYours({ id = 'make-it-yours', summary, title = 'Make it yours', busy = false, closeOnSubmit = true, children }: {
  id?: string; summary: string; title?: string; busy?: boolean; closeOnSubmit?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [chip, setChip] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDialog(open && phone, close, panel);

  useEffect(() => {
    const mq = window.matchMedia?.(PHONE);
    if (!mq) return;
    const update = () => { setPhone(mq.matches); if (!mq.matches) setOpen(false); };
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // The chip shows while the beat is on screen and nothing it must not cover is.
  useEffect(() => {
    const host = root.current;
    const beat = host?.closest('.miy-beat') ?? host?.parentElement;
    if (!host || !beat || typeof IntersectionObserver !== 'function') return;
    let inBeat = false;
    const blocking = new Set<Element>();
    const sync = () => setChip(inBeat && blocking.size === 0);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === beat) inBeat = e.isIntersecting;
        else if (e.isIntersecting) blocking.add(e.target); else blocking.delete(e.target);
      }
      sync();
    });
    io.observe(beat);
    document.querySelectorAll(AVOID).forEach((el) => { if (!beat.contains(el)) io.observe(el); });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = panel.current;
    if (!el || !closeOnSubmit) return;
    const onSubmit = () => { if (phone) setOpen(false); };
    el.addEventListener('submit', onSubmit);
    return () => el.removeEventListener('submit', onSubmit);
  }, [closeOnSubmit, phone]);

  const cls = `miy${open ? ' is-open' : ''}${chip && !open ? ' is-chip-shown' : ''}${busy ? ' is-busy' : ''}`;
  const titleId = `${id}-title`;
  const modal = phone ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, ...inertWhen(!open) } : {};
  return (
    <div ref={root} className={cls}>
      <button type="button" className="miy-chip" data-sheet-open={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}>
        <span className="miy-chip-text">{summary}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="miy-sheet" id={id} {...modal}>
        <div className="sheet-scrim" id={`${id}-scrim`} onClick={close} aria-hidden="true" />
        <div ref={panel} className="sheet-panel miy-panel" tabIndex={-1}>
          <span className="sheet-grip" aria-hidden="true" />
          <div className="sheet-head">
            <h2 className="sheet-title" id={titleId}>{title}</h2>
            <button type="button" className="sheet-close" onClick={close} aria-label="Close"><CloseIcon /></button>
          </div>
          <div className="sheet-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
