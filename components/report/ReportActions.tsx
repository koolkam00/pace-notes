'use client';

import { useEffect, useRef, useState } from 'react';
import { trackAnalytics, trackFailure } from '@/lib/analytics';
import { chunkLoadFailed } from '@/lib/chunk-reload';
import { REPORT_IMAGE_NAME, reportImageAlt, reportLines, type ReportGender, type ReportModel } from '@/lib/report';
import type { UnitSystem } from '@/lib/units';

type Note = { kind: 'ok' | 'error'; text: string } | null;
const cancelled = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';

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
 * Under the card's title, so a phone shows them without scrolling past the whole card: the same print button, and a
 * button down to the other outputs, which moves focus to Save image.
 */
export function ReportJump({ cardId, actionsId }: { cardId: string; actionsId: string }) {
  const down = () => {
    const row = document.getElementById(actionsId);
    row?.scrollIntoView({ block: 'center' });
    row?.querySelector<HTMLButtonElement>('[data-report-save]')?.focus({ preventScroll: true });
  };
  return (
    <div className="race-report-jump no-print">
      <button type="button" data-not-edit onClick={() => printCard(cardId)}>Print or save as PDF</button>
      <button type="button" data-not-edit onClick={down}>Save or share <span aria-hidden="true">↓</span></button>
    </div>
  );
}

/** "the nine times, the course and the comparison group you chose (women)": what a typed report's link carries. */
function carried(link: string | null, gender: ReportGender): string {
  const parts = ['the nine times', ...(link?.includes('&course=') ? ['the course'] : []), ...(gender === 'all' ? [] : [`the comparison group you chose (${gender})`])];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

/**
 * The report's outputs, in the share bar's row (`.tool-share .share-bar`, so none counts as a tool edit): print or save as
 * PDF through the browser, a 1080 × 1350 image drawn only when asked for (lib/report-image.ts, loaded with import() on
 * the first press), the share sheet, and the report's link. Analytics hears only that an image was saved or a share went
 * through (`report_exported`), a copied link and a print (`tool_used`), and a failure's kind (`site_error` `export`):
 * never a time, a course or the link.
 */
export default function ReportActions({ id, model, units, link, cardId, gender }: { id: string; model: ReportModel; units: UnitSystem; link: string | null; cardId: string; gender: ReportGender }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);
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
    setNote({ kind: 'ok', text: `Saved as ${REPORT_IMAGE_NAME}. On a phone you can also press and hold the image below to keep it.` });
  };

  const onSave = async () => {
    if (waiting) return;
    setBusy(true); setNote(null);
    try { await saveImage(); } catch (error) { failed(error, 'The image could not be made in this browser. Use Print or save as PDF instead.'); } finally { setBusy(false); }
  };
  // The image when the browser can share files (iOS Safari 15 and later), else the link, else the image is saved.
  const onShare = async () => {
    if (waiting) return;
    setBusy(true); setNote(null);
    try {
      const probe = typeof File === 'function' ? new File([new Blob()], REPORT_IMAGE_NAME, { type: 'image/png' }) : null;
      if (probe && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })) {
        const fresh = made.current?.key !== key;
        const file = new File([await image()], REPORT_IMAGE_NAME, { type: 'image/png' });
        try {
          await navigator.share({ files: [file], title: 'Race report' });
        } catch (error) {
          if (cancelled(error)) return;
          // Drawing the image can outlast the press a browser lets a share sheet open from; it is ready for the next press.
          if (fresh && (error as { name?: unknown }).name === 'NotAllowedError') { setNote({ kind: 'ok', text: 'The image is ready. Press Share again to send it.' }); return; }
          throw error;
        }
      } else if (typeof navigator.share === 'function' && link) {
        try { await navigator.share({ title: 'Race report', url: window.location.origin + link }); } catch (error) { if (cancelled(error)) return; throw error; }
      } else {
        await saveImage();
        return;
      }
      trackAnalytics('report_exported', { format: 'share' });
      setNote({ kind: 'ok', text: 'Shared.' });
    } catch (error) {
      failed(error, 'Sharing did not work here. Use Save image or Copy link instead.');
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

  return (
    <div className="race-report-actions no-print" id={id}>
      <div className="tool-share share-bar">
        <button type="button" className="button-primary" data-not-edit onClick={() => printCard(cardId)}>Print or save as PDF</button>
        <button type="button" className="button-secondary" data-report-save aria-disabled={waiting || undefined} onClick={onSave}>{busy ? 'Making the image…' : pending ? `Loading ${pending}…` : 'Save image'}</button>
        <button type="button" className="button-secondary" aria-disabled={waiting || undefined} onClick={onShare}>Share</button>
        {link ? <button type="button" className="button-secondary" onClick={onCopy}>{copied ? 'Link copied' : 'Copy link'}</button> : null}
      </div>
      <p className="race-report-hint">Print uses the browser’s own PDF export, one page. {model.record
        ? 'The link carries only the nine times and the course; this edition’s comparisons, weather and climb stay out of the image and the link.'
        : `The link carries only ${carried(link, gender)}.`}</p>
      <p className={`race-report-note${note?.kind === 'error' ? ' is-error' : ''}`} aria-live="polite">{copied ? 'Link copied to the clipboard.' : note?.text ?? ''}</p>
      {preview ? <img className="race-report-preview" src={preview.url} alt={preview.alt} width={1080} height={1350} /> : null}
    </div>
  );
}
