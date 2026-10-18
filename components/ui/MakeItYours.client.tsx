'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon, inertWhen, useDialog } from './dialog';

/**
 * Make it yours: a chip and a sheet (spec section 3.5, simplified under section 00). Under 900 px the chip is one 48 px
 * row at the top of the explorer beat: the current selection and a "Change" affordance that opens a bottom sheet
 * holding the page's existing control form. It never floats, so it covers nothing. From 900 px the same form renders
 * inline at the top of the beat, so every label, id and button the tests pin is one DOM instance at every width. No
 * portal: it stays inside the page's masked .analysis-layout.
 *
 * Put it first inside the explorer beat (an element with class miy-beat). `summary` is the current selection ("All
 * courses · 4:00 · All ages"); `busy` draws the updating underline and dims the results (elements with class
 * miy-results inside the beat).
 */
const PHONE = '(max-width: 899.98px)';

export default function MakeItYours({ id = 'make-it-yours', summary, title = 'Make it yours', busy = false, closeOnSubmit = true, defaultOpen = false, children }: {
  id?: string; summary: string; title?: string; busy?: boolean; closeOnSubmit?: boolean;
  /** Open the sheet as it mounts: a control inside one sheet swapped the explorer for another (a comparison switch). */
  defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [phone, setPhone] = useState(false);
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

  useEffect(() => {
    const el = panel.current;
    if (!el || !closeOnSubmit) return;
    const onSubmit = () => { if (phone) setOpen(false); };
    el.addEventListener('submit', onSubmit);
    return () => el.removeEventListener('submit', onSubmit);
  }, [closeOnSubmit, phone]);

  const cls = `miy${open ? ' is-open' : ''}${busy ? ' is-busy' : ''}`;
  const titleId = `${id}-title`;
  const modal = phone ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, ...inertWhen(!open) } : {};
  return (
    <div className={cls}>
      <button type="button" className="miy-chip" data-sheet-open={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}>
        <span className="miy-chip-text">{summary}</span>
        <span className="miy-chip-change">Change</span>
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
