'use client';

import { useEffect, useRef } from 'react';
import { chunkLoadFailed, reloadAfterChunkError } from '@/lib/chunk-reload';
import { trackFailure } from '@/lib/analytics';

const TITLE = "This page didn't load properly | Pace Notes";

// Shown in place of a page that failed while loading or rendering; the site header and footer stay. A full reload is
// the main action because it also fetches any JavaScript file that failed to arrive.
export default function PageError({ error }: { error: Error & { digest?: string } }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Unless the page is reloading, focus the heading so a screen reader says what happened.
  useEffect(() => {
    // A reload is reported by the page it loads (components/SiteAnalytics.tsx). Otherwise only the kind of failure is
    // reported, never the error's message.
    if (reloadAfterChunkError(error)) return;
    if (chunkLoadFailed(error)) trackFailure('chunk_load'); else trackFailure('render');
    heading.current?.focus();
  }, [error]);
  // The tab, and the announcement after a client-side navigation, would otherwise name the page that failed.
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => { if (document.title === TITLE) document.title = previous; };
  }, []);
  return (
    <section className="info-stop page-error">
      <p className="t-kicker">Loading error</p>
      <h1 ref={heading} tabIndex={-1} className="t-display">This page didn&apos;t load properly</h1>
      <p className="info-dek">Something went wrong while loading this page. Reloading usually fixes it.</p>
      <div className="info-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}><span>Reload the page</span></button>
        <a className="btn btn-tertiary" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`}><span>Go to the home page</span></a>
      </div>
    </section>
  );
}
