'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon, inertWhen, useDialog } from './dialog';

/**
 * Make it yours: a chip and a sheet (spec section 3.5, simplified under section 00). At every width the chip is one 48 px
 * row at the top of the explorer beat: the current selection and a "Change" affordance that opens the sheet (a bottom
 * sheet under 600 px, a right drawer from 600 px) holding the page's existing control form. It never floats, so it
 * covers nothing, and an untouched page shows its answer, not a form (critic round 3: from 900 px the form used to sit
 * inline, up to five bare selects under the answer card). The form is one DOM instance, so every label, id and button the
 * tests pin is the same at every width. No portal: it stays inside the page's masked .analysis-layout.
 *
 * Put it first inside the explorer beat (an element with class miy-beat). `summary` is the current selection ("All
 * courses · 4:00 · All ages"); `busy` draws the updating underline and dims the results (elements with class
 * miy-results inside the beat).
 */
export default function MakeItYours({ id = 'make-it-yours', summary, title = 'Make it yours', busy = false, closeOnSubmit = true, defaultOpen = false, children }: {
  id?: string; summary: string; title?: string; busy?: boolean; closeOnSubmit?: boolean;
  /** Open the sheet as it mounts: a control inside one sheet swapped the explorer for another (a comparison switch). */
  defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDialog(open, close, panel);

  useEffect(() => {
    const el = panel.current;
    if (!el || !closeOnSubmit) return;
    const onSubmit = () => setOpen(false);
    el.addEventListener('submit', onSubmit);
    return () => el.removeEventListener('submit', onSubmit);
  }, [closeOnSubmit]);

  const cls = `miy${open ? ' is-open' : ''}${busy ? ' is-busy' : ''}`;
  const titleId = `${id}-title`;
  const modal = { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, ...inertWhen(!open) };
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
