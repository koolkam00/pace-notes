'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Sheet from './Sheet.client';
import type { ShareCard } from '@/lib/share-image';

/**
 * Share a finding (spec section 3.5): a 44 px button that opens a sheet with the 4:5 card preview, Save image
 * (pace-notes-<slug>.png), Copy link and Share… (only where the browser can share). "Add my goal to the card" appears
 * only when the page has a goal, and starts unticked. The renderer (lib/share-image.ts) loads on the first tap, so it
 * adds nothing to a page's initial JavaScript. No analytics event: shares are not counted (owner decision 13).
 */
const SITE = 'https://splithappens.run';

const ShareIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M9 11.5V2.5M5.5 6L9 2.5 12.5 6M4 9.5v5h10v-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function ShareButton({ slug, card, goal, label = 'Share', iconOnly = false, className }: {
  slug: string; card: Omit<ShareCard, 'goal'>; goal?: string; label?: string; iconOnly?: boolean; className?: string;
}) {
  const id = `share-${slug.replace(/[^a-z0-9-]/gi, '-')}`;
  const [open, setOpen] = useState(false);
  const [withGoal, setWithGoal] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [canShare, setCanShare] = useState(false);
  const blob = useRef<Blob | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const link = `${SITE}${card.path === '/' ? '' : card.path}`;

  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setStatus('');
    import('@/lib/share-image')
      .then(({ renderShareCard }) => renderShareCard({ ...card, goal: withGoal && goal ? goal : undefined }))
      .then((b) => {
        if (!live) return;
        blob.current = b;
        setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); });
      })
      .catch(() => { if (live) setStatus('The image could not be drawn in this browser. Copy link still works.'); });
    return () => { live = false; };
    // card is the page's fixed content; redraw when the sheet opens or the goal box changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withGoal, goal]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const save = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = `pace-notes-${slug}.png`;
    document.body.append(a); a.click(); a.remove();
    setStatus('Image saved.');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setStatus('Link copied.'); }
    catch { setStatus(`Copy this link: ${link}`); }
  };
  const share = async () => {
    try {
      const file = blob.current ? new File([blob.current], `pace-notes-${slug}.png`, { type: 'image/png' }) : null;
      const data: ShareData = file && navigator.canShare?.({ files: [file] }) ? { files: [file], url: link } : { url: link };
      await navigator.share(data);
    } catch { /* dismissed */ }
  };

  return (
    <>
      <button type="button" className={`share-btn${iconOnly ? ' is-icon' : ''}${className ? ` ${className}` : ''}`} data-share-open={id} data-sheet-open={id}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-label={iconOnly ? label : undefined} onClick={() => setOpen(true)}>
        <ShareIcon />{iconOnly ? null : <span>{label}</span>}
      </button>
      <Sheet id={id} title="Share this finding" open={open} onClose={close}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img className="share-preview" src={url} alt={`The card: ${card.figure}${card.unit ?? ''}. ${card.claim.replace(/\*/g, '')}`} width={1080} height={1350} />
          : <span className="share-preview is-loading" role="img" aria-label="Drawing the card" />}
        <div className="share-actions">
          <button type="button" className="btn btn-primary is-block" onClick={save} disabled={!url}>Save image</button>
          <button type="button" className="btn btn-secondary is-block" onClick={copy}>Copy link</button>
          {canShare ? <button type="button" className="btn btn-secondary is-block" onClick={share}>Share…</button> : null}
        </div>
        {goal ? (
          <label className="check share-goal"><input type="checkbox" checked={withGoal} onChange={(e) => setWithGoal(e.target.checked)} />Add my goal to the card</label>
        ) : null}
        <p className="share-status" role="status">{status}</p>
      </Sheet>
    </>
  );
}
