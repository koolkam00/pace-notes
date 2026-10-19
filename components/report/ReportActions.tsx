'use client';

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import { trackAnalytics, trackFailure } from '@/lib/analytics';
import { chunkLoadFailed } from '@/lib/chunk-reload';
import { REPORT_IMAGE_NAME, reportImageAlt, reportLines, type ReportGender, type ReportModel } from '@/lib/report';
import type { UnitSystem } from '@/lib/units';

type Note = { kind: 'ok' | 'error'; text: string } | null;

// The share sheet's code loads on the first press of Share, so the report's first paint carries none of it.
const Sheet = lazy(() => import('@/components/ui/Sheet.client'));

/**
 * Print only the report card: every sibling on its way up to <body> is hidden for the printout (`data-print-hide`) and
 * the containers around the card lose their spacing (`data-print-path`; app/report/report.css), so on /runners the
 * search, the records and the other views stay off the page. A browser that never sends afterprint keeps the marks,
 * which only change printing.
 */
export function printCard(cardId: string) {
  const marked: [Element, string][] = [];
  const mark = (element: Element, name: string) => { if (!element.hasAttribute(name)) { element.setAttribute(name, ''); marked.push([element, name]); } };
  for (let node = document.getElementById(cardId); node && node.parentElement && node !== document.body; node = node.parentElement) {
    if (node.id !== cardId) mark(node, 'data-print-path');
    for (const sibling of Array.from(node.parentElement.children)) if (sibling !== node) mark(sibling, 'data-print-hide');
  }
  const done = () => { for (const [element, name] of marked) element.removeAttribute(name); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/**
 * The report's outputs, in the share bar's row (`.tool-share .share-bar`, so none counts as a tool edit): print or save as
 * PDF through the browser (the one primary; on a touch screen or under 600 px, where Share is what a phone does, Share
 * takes the primary look and comes first, app/styles/pages/report.css), and Share, which opens a sheet (rendered in place, inside the report's
 * masked region) that opens on the 1080 × 1350 image itself, drawn when the sheet first opens (lib/report-image.ts, loaded
 * with import() then; a quiet 4:5 placeholder holds its place meanwhile), then saving it, the device's share sheet, the
 * report's link and what the link carries, and on /report these times in the split check (`onward`). Analytics hears
 * only that an
 * image was saved or a share went through (`report_exported`), a copied link and a print (`tool_used`), and a failure's
 * kind (`site_error` `export`): never a time, a course or the link.
 */
export default function ReportActions({ id, model, units, link, cardId, gender, onward = null }: { id: string; model: ReportModel; units: UnitSystem; link: string | null; cardId: string; gender: ReportGender; onward?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const sheetId = `${id}-share`;
  const made = useRef<{ key: string; blob: Blob } | null>(null);
  // The image follows the units and the numbers on screen: a change draws it again, and drops the preview of the last one.
  const key = `${units}|${JSON.stringify(reportLines(model, units))}`;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => { setPreview(null); setNote(null); }, [key]);
  // The image and its alternative text wait for the comparison and the pacing type, so neither is ever left out. The
  // buttons stay focusable meanwhile (aria-disabled, not disabled), so keyboard focus never drops to the page.
  const pending = model.comparison.state === 'loading' ? 'the comparison' : model.type.state === 'loading' ? 'the pacing types' : null;
  const waiting = busy || pending !== null;

  const failed = (error: unknown, text: string) => {
    if (chunkLoadFailed(error)) trackFailure('chunk_load'); else trackFailure('export');
    setNote({ kind: 'error', text });
  };
  const image = async () => {
    if (made.current?.key === key) return made.current.blob;
    const { renderReportImage } = await import('@/lib/report-image');
    const blob = await renderReportImage(model, units);
    made.current = { key, blob };
    return blob;
  };
  const saveImage = async () => {
    const blob = await image();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = REPORT_IMAGE_NAME;
    a.click();
    trackAnalytics('report_exported', { format: 'image' });
    setPreview({ url, alt: reportImageAlt(model, units) });
    setNote({ kind: 'ok', text: 'Saved. On a phone, press and hold the image above to keep it.' });
  };
  // The sheet opens on the image it shares: drawn once the sheet is open and the data is in, and again only when the
  // numbers or the units change. Drawing it is not an export, so analytics hears nothing until it is saved or shared.
  const [drawFailed, setDrawFailed] = useState(false);
  useEffect(() => {
    if (!open || preview || pending !== null) return;
    let live = true;
    setDrawFailed(false);
    image().then((blob) => { if (live) setPreview({ url: URL.createObjectURL(blob), alt: reportImageAlt(model, units) }); }, () => { if (live) setDrawFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preview, pending, key]);

  const onSave = async () => {
    if (waiting) return;
    setBusy(true); setNote(null);
    try { await saveImage(); } catch (error) { failed(error, 'The image could not be made here. Try Print instead.'); } finally { setBusy(false); }
  };
  // The image when the browser can share files (iOS Safari 15 and later), else the link, else the image is saved. The
  // choice lives with the image code (lib/report-image.ts), which loads on the first press.
  const onShare = async () => {
    if (waiting) return;
    setBusy(true); setNote(null);
    try {
      const fresh = made.current?.key !== key;
      const { shareReport } = await import('@/lib/report-image');
      const result = await shareReport(image, link ? window.location.origin + link : null, fresh);
      if (result === 'save') await saveImage();
      else if (result === 'ready') setNote({ kind: 'ok', text: 'The image is ready. Press Share again to send it.' });
      else if (result === 'shared') { trackAnalytics('report_exported', { format: 'share' }); setNote({ kind: 'ok', text: 'Shared.' }); }
    } catch (error) {
      failed(error, 'Sharing did not work here. Try Save image.');
    } finally { setBusy(false); }
  };
  const onCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + link);
      trackAnalytics('tool_used', { action: 'copy_link' });
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { setNote({ kind: 'error', text: 'This browser did not allow copying the link.' }); }
  };

  const hint = `The link carries only the mat times${link?.includes('&course=') ? ' and the course' : ''}${gender === 'all' ? '' : `, and the ${gender} comparison`}${model.record ? '; nothing from this edition reaches it or the image' : ''}.`;
  return (
    <div className="race-report-actions no-print" id={id}>
      <div className="tool-share share-bar">
        {/* Share is the one primary at every width, Print the outline beside it (round 5: the two traded colours
            between a phone and a desktop). */}
        <button type="button" className="btn btn-primary is-compact race-report-share-open" data-sheet-open={sheetId} aria-haspopup="dialog" aria-expanded={open} aria-controls={sheetId}
          onClick={() => { setMounted(true); setOpen(true); }}>Share</button>
        <button type="button" className="btn btn-secondary is-compact race-report-print" data-not-edit onClick={() => printCard(cardId)}>Print or save as PDF</button>
      </div>
      {mounted ? (
        <Suspense fallback={null}>
          <Sheet id={sheetId} title="Share this report" open={open} onClose={close} className="race-report-sheet">
            {/* The card itself first, the reward; its 4:5 place is held while it draws, so the buttons never move. */}
            <figure className={`race-report-preview-frame${preview ? ' is-ready' : ''}`}>
              {preview ? <img className="race-report-preview" src={preview.url} alt={preview.alt} width={1080} height={1350} />
                : <span className="race-report-preview-wait" role="status">{drawFailed ? 'The image could not be drawn here.' : 'Drawing the image…'}</span>}
            </figure>
            <div className="share-actions">
              <button type="button" className="btn btn-primary is-block" data-report-save aria-disabled={waiting || undefined} onClick={onSave}>{busy ? 'Making the image…' : pending ? `Loading ${pending}…` : 'Save image'}</button>
              <button type="button" className="btn btn-secondary is-block race-report-share-native" aria-disabled={waiting || undefined} onClick={onShare}>Send with another app</button>
              {link ? <button type="button" className="btn btn-secondary is-block" onClick={onCopy}>{copied ? 'Link copied' : 'Copy link'}</button> : null}
              {onward ? <Link className="btn btn-tertiary is-block" href={onward}>Open these splits in the split check<Arrow /></Link> : null}
            </div>
            <p className="race-report-hint">{hint}</p>
            <p className={`race-report-note${note?.kind === 'error' ? ' is-error' : ''}`} aria-live="polite">{copied ? 'Link copied to the clipboard.' : note?.text ?? ''}</p>
          </Sheet>
        </Suspense>
      ) : null}
    </div>
  );
}
