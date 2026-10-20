'use client';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { CloseIcon, inertWhen, useDialog } from './dialog';

/**
 * A sheet (spec sections 2.4 and 3.5): a bottom sheet under 600 px and a right drawer from 600 px, for the menu, Make it
 * yours and share. A modal dialog: focus moves in and is trapped, Escape and the scrim close it, focus returns to the
 * opener, the page behind does not scroll. Closed, it is inert (nothing in it takes focus) and hidden once it has slid
 * away. Rendered in place, never through a portal, so it stays inside any masked region around it.
 *
 * The opener carries data-sheet-open={id} (SheetButton does this); the scrim is #{id}-scrim.
 */

/** The dialog behaviour lives in ./dialog (the site menu uses it without this component); re-exported for callers. */
export { inertWhen, useDialog, CloseIcon };

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
